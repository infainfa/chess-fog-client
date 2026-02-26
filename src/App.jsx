import React, { useState, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard }    from './components/ChessBoard.jsx';
import { PlayerBar }     from './components/PlayerBar.jsx';
import { useSocket }     from './hooks/useSocket.js';
import { getVisibleSquares } from './lib/fogEngine.js';
import styles from './App.module.css';

// Мініатюра фігури через той самий cburnett спрайт що й на дошці
function capturedSymbol(type, color) {
  return { type, color };
}

const EMPTY_STATE = {
  gameId: null, myColor: null, turnColor: 'white',
  pieces: null, visibleSquares: null, fogSquares: null,
  dests: new Map(), lastMove: null, gameOver: null,
  capturedByMe: [], capturedByOpp: [],
};

// Збиті фігури відстежуємо через сервер (надходять в move_made)
// captured = { w: ['p','n',...], b: ['q',...] } — pieces taken FROM that color

function forceChessMove(chess, from, to, promotion) {
  try {
    const m = chess.move({ from, to, promotion: promotion || 'q' });
    if (m) return;
  } catch {}
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

function buildPiecesWithFog(board, visibleSquares, myColor, noFog = false) {
  const pieces = new Map();
  const ROLES = { p:'pawn', n:'knight', b:'bishop', r:'rook', q:'queen', k:'king' };
  const myC = myColor === 'white' ? 'w' : 'b';
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank]?.[file];
      if (!piece) continue;
      const sq = `${'abcdefgh'[file]}${8 - rank}`;
      if (noFog || piece.color === myC || visibleSquares.has(sq)) {
        pieces.set(sq, {
          role:  ROLES[piece.type],
          color: piece.color === 'w' ? 'white' : 'black',
        });
      }
    }
  }
  return pieces;
}

function buildFogSquares(board, visibleSquares, myColor, noFog = false) {
  if (noFog) return new Set();
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
  const [fogEnabled, setFogEnabled] = useState(true);
  const [flipped, setFlipped]       = useState(false);

  const startFenRef = useRef('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const movesRef    = useRef([]);
  const [plyIndex, setPlyIndex] = useState(0);

  const chessRef = useRef(new Chess());
  const gameRef  = useRef(EMPTY_STATE);

  const history = movesRef.current;
  const isLive  = plyIndex === history.length;

  const renderAtPly = useCallback((k, myColor, noFog, viewColor) => {
    const chess   = rebuildPosition(startFenRef.current, movesRef.current, k);
    const board   = chess.board();
    const fogColor = noFog ? viewColor : myColor;
    const color   = fogColor === 'white' ? 'w' : 'b';
    const visible = getVisibleSquares(board, color);
    return {
      pieces:     buildPiecesWithFog(board, visible, viewColor, noFog),
      fogSquares: buildFogSquares(board, visible, fogColor, noFog),
      lastMove:   k > 0 ? movesRef.current[k - 1] : null,
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
      setFogEnabled(true);
      setFlipped(false);

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

    onMoveMade({ move, fen, visibleSquares, turn, isGameOver, isCheckmate, isStalemate, winner }) {
      const chess   = chessRef.current;
      const prev    = gameRef.current;
      const visible = new Set(visibleSquares);

      movesRef.current.push({ from: move.from, to: move.to, promotion: 'q' });

      if (fen) {
        try { chess.load(fen); } catch { forceChessMove(chess, move.from, move.to, 'q'); }
      } else {
        forceChessMove(chess, move.from, move.to, 'q');
      }

      const myColor  = prev.myColor;
      const board    = chess.board();
      const pieces   = buildPiecesWithFog(board, visible, myColor);
      const fog      = buildFogSquares(board, visible, myColor);
      const dests    = turn === myColor ? buildDests(chess, myColor, visible) : new Map();
      const gameOver = isGameOver
        ? { winner, reason: isCheckmate ? 'checkmate' : isStalemate ? 'stalemate' : 'unknown' }
        : null;

      // Відстежуємо збиті фігури (move.captured надходить з сервера)
      let capturedByMe  = [...(prev.capturedByMe  || [])];
      let capturedByOpp = [...(prev.capturedByOpp || [])];
      if (move.captured) {
        const myC2  = myColor === 'white' ? 'w' : 'b';
        const oppC2 = myColor === 'white' ? 'b' : 'w';
        const wasMyTurn = prev.turnColor === myColor;
        if (wasMyTurn) {
          // Я збив фігуру суперника — показую в себе кольором суперника
          capturedByMe.push({ type: move.captured, color: oppC2 });
        } else {
          // Суперник збив мою фігуру — показую у суперника кольором моїх фігур
          capturedByOpp.push({ type: move.captured, color: myC2 });
        }
      }

      const newState = { ...prev, turnColor: turn, pieces, visibleSquares: visible, fogSquares: fog, dests, lastMove: move, gameOver, capturedByMe, capturedByOpp };
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

  const goNext = useCallback(() => { if (plyIndex < movesRef.current.length) setPlyIndex(p => p + 1); }, [plyIndex]);
  const goPrev = useCallback(() => { if (plyIndex > 0) setPlyIndex(p => p - 1); }, [plyIndex]);

  const findGame      = useCallback(() => emit('find_game'), [emit]);
  const handleNewGame = useCallback(() => {
    movesRef.current = [];
    gameRef.current  = EMPTY_STATE;
    setPlyIndex(0);
    setFogEnabled(true);
    setFlipped(false);
    setGame(EMPTY_STATE);
    setScreen('lobby');
  }, []);

  const myColor  = game.myColor;
  const oppColor = myColor === 'white' ? 'black' : 'white';
  const myC      = myColor === 'white' ? 'w' : 'b';
  const oppC     = myColor === 'white' ? 'b' : 'w';

  const captured    = myColor ? computeCaptured(movesRef.current) : { w: [], b: [] };
  // My bar: pieces I captured from opponent (show in opponent's color)
  const myCaptured  = captured[oppC].map(t => capturedSymbol(t, oppC));
  // Opp bar: pieces opponent captured from me (show in my color)
  const oppCaptured = captured[myC].map(t => capturedSymbol(t, myC));

  const noFog     = !fogEnabled;
  const viewColor = flipped ? oppColor : myColor;
  const isGameOver = screen === 'gameover';

  let displayPieces, displayFog, displayLastMove, displayTurn;
  if (myColor) {
    if (isLive && screen === 'playing') {
      const board   = chessRef.current.board();
      const visible = game.visibleSquares || new Set();
      displayPieces   = buildPiecesWithFog(board, visible, viewColor || 'white', noFog);
      displayFog      = buildFogSquares(board, visible, noFog ? (viewColor || 'white') : myColor, noFog);
      displayLastMove = game.lastMove;
      displayTurn     = game.turnColor;
    } else {
      const r = renderAtPly(plyIndex, myColor, noFog, viewColor || 'white');
      displayPieces   = r.pieces;
      displayFog      = r.fogSquares;
      displayLastMove = r.lastMove;
      displayTurn     = null;
    }
  }

  const canGoPrev = plyIndex > 0;
  const canGoNext = plyIndex < movesRef.current.length;
  const moveNum   = isLive ? history.length : plyIndex;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <img src="/fog-of-chess-logo.png" alt="Fog of Chess" className={styles.headerLogo} />
      </header>

      {/* Lobby */}
      {(screen === 'lobby' || screen === 'waiting') && (
        <div className={styles.lobby}>
          <FogPreview />
          <div className={styles.rules}>
            <p>You only see squares your pieces attack.</p>
            <p>Enemy pieces are visible only within your vision.</p>
            <p>Check is not announced.</p>
            <p>👑 The game ends when the king is captured.</p>
            <p>Have fun</p>
            <PawnRules />
          </div>
          {screen === 'lobby' && (
            <button className={styles.playBtn} onClick={findGame}>Find Game</button>
          )}
          {screen === 'waiting' && (
            <p className={styles.waitingText}>Searching for opponent…</p>
          )}
        </div>
      )}

      {/* Game */}
      {(screen === 'playing' || screen === 'gameover') && myColor && (
        <div className={styles.game}>

          <PlayerBar
            color={flipped ? myColor : oppColor}
            name="Opponent"
            isActive={game.turnColor === oppColor && screen === 'playing' && isLive}
            capturedPieces={oppCaptured}
          />

          <ChessBoard
            pieces={displayPieces}
            visibleSquares={displayFog}
            myColor={viewColor || 'white'}
            turnColor={isLive && !isGameOver ? game.turnColor : null}
            dests={isLive && !isGameOver ? game.dests : new Map()}
            lastMove={displayLastMove}
            onMove={handleMove}
          />

          <PlayerBar
            color={flipped ? oppColor : myColor}
            name="You"
            isActive={game.turnColor === myColor && screen === 'playing' && isLive}
            capturedPieces={myCaptured}
          />

          {/* Navigation */}
          <div className={styles.controls}>
            <button className={styles.navBtn} onClick={goPrev} disabled={!canGoPrev}>◀</button>
            <span className={styles.moveCounter}>
              {!isLive ? (
                <>
                  Move {moveNum} / {history.length}
                  <button className={styles.liveBtn} onClick={() => setPlyIndex(history.length)}>Live</button>
                </>
              ) : `Move ${history.length}`}
            </span>
            <button className={styles.navBtn} onClick={goNext} disabled={!canGoNext}>▶</button>
          </div>

          {/* Post-game actions */}
          {isGameOver && (
            <div className={styles.postGame}>
              <div className={styles.gameResult}>
                {game.gameOver?.winner === myColor ? '👑 You Won' :
                 game.gameOver?.winner ? 'You Lost' : 'Draw'}
              </div>
              <div className={styles.postGameBtns}>
                <button
                  className={noFog ? styles.dispelBtnActive : styles.dispelBtn}
                  onClick={() => setFogEnabled(f => !f)}
                >
                  {fogEnabled ? '☁️ Dispel the Fog' : '🌫️ Restore Fog'}
                </button>
                <button className={styles.flipBtn} onClick={() => setFlipped(f => !f)}>
                  ⇅ Flip Board
                </button>
                <button className={styles.newGameBtn} onClick={handleNewGame}>
                  New Game
                </button>
              </div>
            </div>
          )}

          {/* Resign */}
          {screen === 'playing' && isLive && (
            <button className={styles.resignBtn} onClick={() => emit('resign', { gameId: game.gameId })}>
              Resign
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function buildDests(chess, myColor, visibleSquares) {
  const color = myColor === 'white' ? 'w' : 'b';
  if (chess.turn() !== color) return new Map();
  const dests = new Map();
  const FILES = ['a','b','c','d','e','f','g','h'];
  const DIRS = {
    r: [[1,0],[-1,0],[0,1],[0,-1]],
    b: [[1,1],[1,-1],[-1,1],[-1,-1]],
    q: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],
    n: [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]],
    k: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],
  };
  function sq(f, r) { return FILES[f] + (r + 1); }

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const square = sq(file, rank);
      const piece  = chess.get(square);
      if (!piece || piece.color !== color) continue;
      if (!visibleSquares.has(square)) continue;
      const targets = [];
      if (piece.type === 'p') {
        const dir = color === 'w' ? 1 : -1, start = color === 'w' ? 1 : 6;
        const r1 = rank + dir;
        if (r1 >= 0 && r1 < 8) {
          const fwd = sq(file, r1);
          if (!chess.get(fwd)) {
            targets.push(fwd);
            if (rank === start) { const fwd2 = sq(file, rank + dir * 2); if (!chess.get(fwd2)) targets.push(fwd2); }
          }
          for (const df of [-1, 1]) {
            const ff = file + df;
            if (ff >= 0 && ff < 8) {
              const diag = sq(ff, r1), target = chess.get(diag);
              if (target && target.color !== color) targets.push(diag);
              const ep = chess.fen().split(' ')[3];
              if (ep && ep !== '-' && ep === diag) targets.push(diag);
            }
          }
        }
      } else if (piece.type === 'n') {
        for (const [df, dr] of DIRS.n) {
          const nf = file + df, nr = rank + dr;
          if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
          const t = chess.get(sq(nf, nr));
          if (!t || t.color !== color) targets.push(sq(nf, nr));
        }
      } else if (piece.type === 'k') {
        for (const [df, dr] of DIRS.k) {
          const nf = file + df, nr = rank + dr;
          if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
          const t = chess.get(sq(nf, nr));
          if (!t || t.color !== color) targets.push(sq(nf, nr));
        }
        const castling = chess.fen().split(' ')[2], kr = color === 'w' ? 0 : 7;
        if (rank === kr && file === 4) {
          if (castling.includes(color === 'w' ? 'K' : 'k') && !chess.get(sq(5,kr)) && !chess.get(sq(6,kr))) targets.push(sq(6,kr));
          if (castling.includes(color === 'w' ? 'Q' : 'q') && !chess.get(sq(3,kr)) && !chess.get(sq(2,kr)) && !chess.get(sq(1,kr))) targets.push(sq(2,kr));
        }
      } else {
        for (const [df, dr] of DIRS[piece.type]) {
          let nf = file + df, nr = rank + dr;
          while (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
            const t = chess.get(sq(nf, nr));
            if (t) { if (t.color !== color) targets.push(sq(nf, nr)); break; }
            targets.push(sq(nf, nr)); nf += df; nr += dr;
          }
        }
      }
      if (targets.length > 0) dests.set(square, targets);
    }
  }
  return dests;
}

function PawnRules() {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ marginTop: '8px' }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '11px', letterSpacing: '0.05em', padding: '0', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
        {open ? '▾' : '▸'} ♟️ pawn visibility rules
      </button>
      {open && (
        <div style={{ marginTop: '8px', color: 'rgba(255,255,255,0.45)', fontSize: '11px', lineHeight: '1.7', textAlign: 'left' }}>
          <p style={{margin:'2px 0'}}>a pawn sees one square forward if empty, and</p>
          <p style={{margin:'2px 0'}}>two from its starting square if both are empty.</p>
          <p style={{margin:'2px 0'}}>if blocked, it cannot move or see beyond.</p>
          <p style={{margin:'2px 0'}}>it only sees diagonally when an enemy piece is there (and can capture it).</p>
          <p style={{margin:'2px 0'}}>all standard chess rules apply.</p>
        </div>
      )}
    </div>
  );
}

function FogPreview() {
  const squares = [];
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const light = (r + f) % 2 === 0;
      const fog   = r < 4 ? (Math.random() > 0.15) : (Math.random() > 0.75);
      squares.push(
        <div key={`${r}${f}`} style={{ backgroundColor: light ? '#c8c8c8' : '#888', position: 'relative', filter: 'grayscale(1)' }}>
          {fog && <div style={{ position: 'absolute', inset: 0, background: `rgba(8,8,8,${0.7 + Math.random() * 0.25})` }}/>}
        </div>
      );
    }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)', width: 'min(72vw, 220px)', height: 'min(72vw, 220px)', border: '1px solid #222', overflow: 'hidden' }}>
      {squares}
    </div>
  );
}
