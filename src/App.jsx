import { useState, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard }    from './components/ChessBoard.jsx';
import { PlayerBar }     from './components/PlayerBar.jsx';
import { GameOverModal } from './components/GameOverModal.jsx';
import { useSocket }     from './hooks/useSocket.js';
import { boardToPieces, getVisibleSquares } from './lib/fogEngine.js';
import styles from './App.module.css';

const EMPTY_STATE = {
  gameId: null, myColor: null, turnColor: 'white',
  pieces: null, visibleSquares: null, fogSquares: null,
  dests: new Map(), lastMove: null, gameOver: null,
};

function forceChessMove(chess, from, to, promotion) {
  // Спробуємо звичайний хід
  try {
    const m = chess.move({ from, to, promotion: promotion || 'q' });
    if (m) return;
  } catch {}
  // Форсуємо через FEN flip
  const fenParts = chess.fen().split(' ');
  const realTurn = fenParts[1];
  fenParts[1] = realTurn === 'w' ? 'b' : 'w';
  try {
    const temp = new Chess(fenParts.join(' '));
    const m = temp.move({ from, to, promotion: promotion || 'q' });
    if (m) chess.load(temp.fen());
  } catch {}
}

function rebuildPosition(startFen, moves, k) {
  const chess = new Chess(startFen);
  for (let i = 0; i < k; i++) {
    forceChessMove(chess, moves[i].from, moves[i].to, moves[i].promotion || 'q');
  }
  return chess;
}

function buildPiecesWithFog(board, visibleSquares, myColor) {
  const pieces = new Map();
  const ROLES = { p:'pawn', n:'knight', b:'bishop', r:'rook', q:'queen', k:'king' };
  const myC = myColor === 'white' ? 'w' : 'b';
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank]?.[file];
      if (!piece) continue;
      const sq = `${'abcdefgh'[file]}${8 - rank}`;
      if (piece.color === myC || visibleSquares.has(sq)) {
        pieces.set(sq, {
          role:  ROLES[piece.type],
          color: piece.color === 'w' ? 'white' : 'black',
        });
      }
    }
  }
  return pieces;
}

function buildFogSquares(board, visibleSquares, myColor) {
  const myC = myColor === 'white' ? 'w' : 'b';
  const fog = new Set();
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const sq = `${'abcdefgh'[file]}${8 - rank}`;
      if (visibleSquares.has(sq)) continue;
      const piece = board[rank]?.[file];
      if (piece && piece.color === myC) continue;
      fog.add(sq);
    }
  }
  return fog;
}

export default function App() {
  const [screen, setScreen] = useState('lobby');
  const [game, setGame]     = useState(EMPTY_STATE);

  const startFenRef  = useRef('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const movesRef     = useRef([]);
  const [plyIndex, setPlyIndex] = useState(0);

  const chessRef = useRef(new Chess());
  const gameRef  = useRef(EMPTY_STATE);

  const history     = movesRef.current;
  const isLive      = plyIndex === history.length;

  const renderAtPly = useCallback((k, myColor) => {
    const chess   = rebuildPosition(startFenRef.current, movesRef.current, k);
    const board   = chess.board();
    const color   = myColor === 'white' ? 'w' : 'b';
    const visible = getVisibleSquares(board, color);
    return {
      pieces:         buildPiecesWithFog(board, visible, myColor),
      visibleSquares: visible,
      fogSquares:     buildFogSquares(board, visible, myColor),
      lastMove:       k > 0 ? movesRef.current[k - 1] : null,
    };
  }, []);

  const { emit } = useSocket({
    onWaiting() { setScreen('waiting'); },

    onGameStart({ gameId, color, visibleSquares, turn }) {
      const chess = new Chess();
      chessRef.current = chess;
      movesRef.current = [];
      startFenRef.current = chess.fen();
      setPlyIndex(0);

      const visible = new Set(visibleSquares);
      const myColor = color;
      const board   = chess.board();
      const pieces  = buildPiecesWithFog(board, visible, myColor);
      const fog     = buildFogSquares(board, visible, myColor);
      const dests   = buildDests(chess, myColor, visible);

      const newState = {
        gameId, myColor, turnColor: turn,
        pieces, visibleSquares: visible, fogSquares: fog,
        dests: turn === myColor ? dests : new Map(),
        lastMove: null, gameOver: null,
      };

      gameRef.current = newState;
      setGame(newState);
      setScreen('playing');
    },

    onMoveMade({ move, visibleSquares, turn, isGameOver, isCheckmate, isStalemate, winner }) {
      const chess   = chessRef.current;
      const prev    = gameRef.current;
      const visible = new Set(visibleSquares);

      movesRef.current.push({ from: move.from, to: move.to, promotion: 'q' });

      forceChessMove(chess, move.from, move.to, 'q');

      const myColor  = prev.myColor;
      const board    = chess.board();
      const pieces   = buildPiecesWithFog(board, visible, myColor);
      const fog      = buildFogSquares(board, visible, myColor);
      const dests    = turn === myColor ? buildDests(chess, myColor, visible) : new Map();
      const gameOver = isGameOver
        ? { winner, reason: isCheckmate ? 'checkmate' : isStalemate ? 'stalemate' : 'unknown' }
        : null;

      const newState = {
        ...prev, turnColor: turn,
        pieces, visibleSquares: visible, fogSquares: fog,
        dests, lastMove: move, gameOver,
      };

      gameRef.current = newState;
      setGame(newState);
      setPlyIndex(movesRef.current.length);

      if (isGameOver) setScreen('gameover');
    },

    onGameOver({ winner, reason }) {
      const newState = { ...gameRef.current, gameOver: { winner, reason } };
      gameRef.current = newState;
      setGame(newState);
      setScreen('gameover');
    },

    onError({ message }) { console.warn('[game error]', message); },
  });

  const handleMove = useCallback((from, to) => {
    const g = gameRef.current;
    if (!g.gameId || plyIndex < movesRef.current.length) return;
    emit('make_move', { gameId: g.gameId, from, to });
  }, [emit, plyIndex]);

  const goNext = useCallback(() => {
    if (plyIndex >= movesRef.current.length) return;
    setPlyIndex(p => p + 1);
  }, [plyIndex]);

  const goPrev = useCallback(() => {
    if (plyIndex === 0) return;
    setPlyIndex(p => p - 1);
  }, [plyIndex]);

  const findGame      = useCallback(() => emit('find_game'), [emit]);
  const handleNewGame = useCallback(() => {
    movesRef.current = [];
    gameRef.current  = EMPTY_STATE;
    setPlyIndex(0);
    setGame(EMPTY_STATE);
    setScreen('lobby');
  }, []);

  const myColor = game.myColor;

  let displayPieces, displayFog, displayLastMove, displayTurn;
  if (isLive || !myColor) {
    displayPieces   = game.pieces;
    displayFog      = game.fogSquares;
    displayLastMove = game.lastMove;
    displayTurn     = game.turnColor;
  } else {
    const r = renderAtPly(plyIndex, myColor);
    displayPieces   = r.pieces;
    displayFog      = r.fogSquares;
    displayLastMove = r.lastMove;
    displayTurn     = null;
  }

  const oppColor   = myColor === 'white' ? 'black' : 'white';
  const canGoPrev  = plyIndex > 0;
  const canGoNext  = plyIndex < movesRef.current.length;
  const moveNum    = isLive ? history.length : plyIndex;

  return (
    <div className={styles.root}>

      {/* ── Logo header — на кожній сторінці ── */}
      <header className={styles.header}>
        <img
          src="/fog-of-chess-logo.png"
          alt="Fog of Chess"
          className={styles.headerLogo}
        />
      </header>

      {/* ── Lobby ── */}
      {(screen === 'lobby' || screen === 'waiting') && (
        <div className={styles.lobby}>
          <FogPreview />

          <div className={styles.rules}>
            <p>You only see squares your pieces <strong>attack</strong>.</p>
            <p>Check is <em>not announced</em> — you may not know you're in check.</p>
          </div>

          {screen === 'lobby' && (
            <button className={styles.playBtn} onClick={findGame}>
              Find Game
            </button>
          )}

          {screen === 'waiting' && (
            <p className={styles.waitingText}>Searching for opponent…</p>
          )}
        </div>
      )}

      {/* ── Game ── */}
      {(screen === 'playing' || screen === 'gameover') && myColor && (
        <div className={styles.game}>
          <PlayerBar
            color={oppColor}
            name="Opponent"
            isActive={game.turnColor === oppColor && screen === 'playing' && isLive}
          />

          <ChessBoard
            pieces={displayPieces}
            visibleSquares={displayFog}
            myColor={myColor}
            turnColor={isLive ? game.turnColor : null}
            dests={isLive ? game.dests : new Map()}
            lastMove={displayLastMove}
            onMove={handleMove}
          />

          <PlayerBar
            color={myColor}
            name="You"
            isActive={game.turnColor === myColor && screen === 'playing' && isLive}
          />

          <div className={styles.controls}>
            <button className={styles.navBtn} onClick={goPrev} disabled={!canGoPrev}>◀</button>

            <span className={styles.moveCounter}>
              {!isLive ? (
                <>
                  Move {moveNum} / {history.length}
                  <button className={styles.liveBtn} onClick={() => setPlyIndex(history.length)}>
                    Live
                  </button>
                </>
              ) : `Move ${history.length}`}
            </span>

            <button className={styles.navBtn} onClick={goNext} disabled={!canGoNext}>▶</button>
          </div>

          {screen === 'playing' && isLive && (
            <button className={styles.resignBtn} onClick={() => emit('resign', { gameId: game.gameId })}>
              Resign
            </button>
          )}
        </div>
      )}

      {/* ── Game Over ── */}
      {screen === 'gameover' && game.gameOver && (
        <GameOverModal
          winner={game.gameOver.winner}
          reason={game.gameOver.reason}
          myColor={myColor}
          onNewGame={handleNewGame}
        />
      )}
    </div>
  );
}

function buildDests(chess, myColor, visibleSquares) {
  const color = myColor === 'white' ? 'w' : 'b';
  if (chess.turn() !== color) return new Map();

  // Власний генератор ходів без перевірки шаху.
  // Генеруємо всі фізично можливі ходи для кожної нашої фігури
  // ігноруючи обмеження "не можна залишати короля під шахом".
  const dests = new Map();
  const FILES = ['a','b','c','d','e','f','g','h'];

  // Напрямки руху для кожного типу фігури
  const DIRS = {
    r: [[1,0],[-1,0],[0,1],[0,-1]],
    b: [[1,1],[1,-1],[-1,1],[-1,-1]],
    q: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],
    n: [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]],
    k: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],
  };

  function sq(f, r) { return FILES[f] + (r + 1); }
  function coords(square) {
    return [FILES.indexOf(square[0]), parseInt(square[1]) - 1];
  }

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const square = sq(file, rank);
      const piece  = chess.get(square);
      if (!piece || piece.color !== color) continue;
      if (!visibleSquares.has(square)) continue;

      const targets = [];

      if (piece.type === 'p') {
        // Пішак — своя логіка
        const dir   = color === 'w' ? 1 : -1;
        const start = color === 'w' ? 1 : 6;

        // Хід вперед
        const r1 = rank + dir;
        if (r1 >= 0 && r1 < 8) {
          const fwd = sq(file, r1);
          if (!chess.get(fwd)) {
            targets.push(fwd);
            // Подвійний хід з початкової позиції
            if (rank === start) {
              const r2  = rank + dir * 2;
              const fwd2 = sq(file, r2);
              if (!chess.get(fwd2)) targets.push(fwd2);
            }
          }
          // Взяття по діагоналі
          for (const df of [-1, 1]) {
            const ff = file + df;
            if (ff >= 0 && ff < 8) {
              const diag = sq(ff, r1);
              const target = chess.get(diag);
              if (target && target.color !== color) targets.push(diag);
              // En passant (спрощено)
              const ep = chess.fen().split(' ')[3];
              if (ep && ep !== '-' && ep === diag) targets.push(diag);
            }
          }
        }
      } else if (piece.type === 'n' || piece.type === 'k') {
        // Кінь і король — разові стрибки
        for (const [df, dr] of DIRS[piece.type]) {
          const nf = file + df;
          const nr = rank + dr;
          if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
          const target = chess.get(sq(nf, nr));
          if (!target || target.color !== color) targets.push(sq(nf, nr));
        }
      } else {
        // Тура, слон, ферзь — sliding pieces
        for (const [df, dr] of DIRS[piece.type]) {
          let nf = file + df;
          let nr = rank + dr;
          while (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
            const target = chess.get(sq(nf, nr));
            if (target) {
              if (target.color !== color) targets.push(sq(nf, nr));
              break; // заблоковано
            }
            targets.push(sq(nf, nr));
            nf += df;
            nr += dr;
          }
        }
      }

      if (targets.length > 0) dests.set(square, targets);
    }
  }

  return dests;
}
function FogPreview() {
  const squares = [];
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const light = (r + f) % 2 === 0;
      const fog   = r < 4 ? (Math.random() > 0.15) : (Math.random() > 0.75);
      squares.push(
        <div key={`${r}${f}`} style={{
          backgroundColor: light ? '#c8c8c8' : '#888',
          position: 'relative',
          filter: 'grayscale(1)',
        }}>
          {fog && <div style={{
            position: 'absolute', inset: 0,
            background: `rgba(8,8,8,${0.7 + Math.random() * 0.25})`,
          }}/>}
        </div>
      );
    }
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(8, 1fr)',
      gridTemplateRows:    'repeat(8, 1fr)',
      width: 'min(72vw, 220px)',
      height: 'min(72vw, 220px)',
      border: '1px solid #222',
      overflow: 'hidden',
    }}>
      {squares}
    </div>
  );
}
