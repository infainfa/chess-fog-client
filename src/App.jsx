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

function rebuildPosition(startFen, moves, k) {
  const chess = new Chess(startFen);
  for (let i = 0; i < k; i++) {
    chess.move({ from: moves[i].from, to: moves[i].to, promotion: moves[i].promotion || 'q' });
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

      try { chess.move({ from: move.from, to: move.to, promotion: 'q' }); }
      catch(e) { console.warn('chess.move error:', e.message); return; }

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
  const dests = new Map();

  // HARDCORE FOG: показуємо всі фізично можливі ходи
  // включно з ходами під шахом — гравець не знає що він під шахом.
  // Хак: міняємо чергу ходів у FEN — chess.js перестає блокувати
  // ходи через шах і повертає всі фізичні ходи.
  const fen = chess.fen();
  const fenParts = fen.split(' ');
  fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w';
  const flippedFen = fenParts.join(' ');

  try {
    const tempChess = new Chess(flippedFen);
    tempChess.moves({ verbose: true }).forEach(m => {
      const piece = chess.get(m.from);
      if (!piece || piece.color !== color) return;
      if (!visibleSquares.has(m.from)) return;
      if (!dests.has(m.from)) dests.set(m.from, []);
      dests.get(m.from).push(m.to);
    });
  } catch {
    chess.moves({ verbose: true }).forEach(m => {
      if (!visibleSquares.has(m.from)) return;
      if (!dests.has(m.from)) dests.set(m.from, []);
      dests.get(m.from).push(m.to);
    });
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
