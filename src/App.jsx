import { useState, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard }    from './components/ChessBoard.jsx';
import { PlayerBar }     from './components/PlayerBar.jsx';
import { GameOverModal } from './components/GameOverModal.jsx';
import { useSocket }     from './hooks/useSocket.js';
import { boardToPieces, getVisibleSquares } from './lib/fogEngine.js';
import styles from './App.module.css';

// ═══════════════════════════════════════════════
// REPLAY ENGINE (по скрипту chess.com)
//
// Зберігаємо:
//   startFen  — початкова позиція
//   moves[]   — масив { from, to, promotion } всіх ходів партії
//   plyIndex  — 0 = до першого ходу, N = після N-го ходу
//
// При Prev → rebuild: відновлюємо позицію застосовуючи перші plyIndex ходів
// При Next → apply move, plyIndex++
// При Jump(K) → rebuild до K
//
// Render:
//   - Свої фігури: завжди видимі (навіть якщо fog)
//   - Ворожі фігури: тільки на visible клітинках
//   - Fog overlay: на невидимих клітинках (крім своїх фігур)
// ═══════════════════════════════════════════════

const EMPTY_STATE = {
  gameId: null, myColor: null, turnColor: 'white',
  pieces: null, visibleSquares: null,
  dests: new Map(), lastMove: null, gameOver: null,
};

// Відновлює позицію з нуля застосовуючи перші K ходів
function rebuildPosition(startFen, moves, k) {
  const chess = new Chess(startFen);
  for (let i = 0; i < k; i++) {
    chess.move({ from: moves[i].from, to: moves[i].to, promotion: moves[i].promotion || 'q' });
  }
  return chess;
}

// Будує pieces для chessground з урахуванням fog.
// Свої фігури — завжди видимі.
// Ворожі — тільки якщо клітинка в visible.
function buildPiecesWithFog(board, visibleSquares, myColor) {
  const pieces = new Map();
  const ROLES = { p:'pawn', n:'knight', b:'bishop', r:'rook', q:'queen', k:'king' };
  const myC = myColor === 'white' ? 'w' : 'b';

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank]?.[file];
      if (!piece) continue;

      const sq = `${'abcdefgh'[file]}${8 - rank}`;
      const isMine = piece.color === myC;

      // Свої — завжди показуємо
      // Ворожі — тільки якщо клітинка видима
      if (isMine || visibleSquares.has(sq)) {
        pieces.set(sq, {
          role:  ROLES[piece.type],
          color: piece.color === 'w' ? 'white' : 'black',
        });
      }
    }
  }
  return pieces;
}

// Fog overlay: накриваємо клітинки які НЕ видимі І де немає своїх фігур
function buildFogSquares(board, visibleSquares, myColor) {
  const myC = myColor === 'white' ? 'w' : 'b';
  const fogSquares = new Set();

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const sq = `${'abcdefgh'[file]}${8 - rank}`;
      if (visibleSquares.has(sq)) continue; // видима — не туман

      const piece = board[rank]?.[file];
      if (piece && piece.color === myC) continue; // своя фігура — не накриваємо

      fogSquares.add(sq);
    }
  }
  return fogSquares;
}

export default function App() {
  const [screen, setScreen] = useState('lobby');
  const [game, setGame]     = useState(EMPTY_STATE);

  // Replay state
  const startFenRef  = useRef('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const movesRef     = useRef([]); // { from, to, promotion } — всі ходи партії
  const [plyIndex, setPlyIndex] = useState(0);
  const totalPlies   = movesRef.current.length;
  const isReviewing  = plyIndex < totalPlies && screen !== 'lobby' && screen !== 'waiting';

  // Поточна live позиція (для гри)
  const chessRef  = useRef(new Chess());
  const gameRef   = useRef(EMPTY_STATE);

  // Replay: обчислити і відрендерити позицію на plyIndex K
  const renderAtPly = useCallback((k, myColor) => {
    const chess = rebuildPosition(startFenRef.current, movesRef.current, k);
    const board = chess.board();
    const color = myColor === 'white' ? 'w' : 'b';
    const visible = getVisibleSquares(board, color);
    const pieces  = buildPiecesWithFog(board, visible, myColor);
    const fog     = buildFogSquares(board, visible, myColor);
    const lastMove = k > 0 ? movesRef.current[k - 1] : null;
    return { pieces, visibleSquares: visible, fogSquares: fog, lastMove };
  }, []);

  // ─── Socket handlers ──────────────────────────────────

  const { emit } = useSocket({
    onWaiting() { setScreen('waiting'); },

    onGameStart({ gameId, color, visibleSquares, turn }) {
      const chess = new Chess();
      chessRef.current = chess;
      movesRef.current = [];
      startFenRef.current = chess.fen();
      setPlyIndex(0);

      const visible  = new Set(visibleSquares);
      const myColor  = color;
      const board    = chess.board();
      const pieces   = buildPiecesWithFog(board, visible, myColor);
      const fog      = buildFogSquares(board, visible, myColor);
      const dests    = buildDests(chess, myColor, visible);

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

      // Зберігаємо хід в масив
      movesRef.current.push({ from: move.from, to: move.to, promotion: 'q' });

      // Застосовуємо в chess.js
      try {
        chess.move({ from: move.from, to: move.to, promotion: 'q' });
      } catch(e) {
        console.warn('chess.move error:', e.message);
        return;
      }

      const myColor  = prev.myColor;
      const board    = chess.board();
      const pieces   = buildPiecesWithFog(board, visible, myColor);
      const fog      = buildFogSquares(board, visible, myColor);
      const dests    = turn === myColor ? buildDests(chess, myColor, visible) : new Map();
      const gameOver = isGameOver
        ? { winner, reason: isCheckmate ? 'checkmate' : isStalemate ? 'stalemate' : 'unknown' }
        : null;

      const newState = {
        ...prev,
        turnColor: turn,
        pieces, visibleSquares: visible, fogSquares: fog,
        dests, lastMove: move, gameOver,
      };

      gameRef.current = newState;
      setGame(newState);
      // Повертаємось до live (кінець history)
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
    if (!g.gameId) return;
    // Блокуємо хід якщо переглядаємо (не на останньому ply)
    if (plyIndex < movesRef.current.length) return;
    emit('make_move', { gameId: g.gameId, from, to });
  }, [emit, plyIndex]);

  // ─── NEXT (по скрипту) ────────────────────────────────
  const goNext = useCallback(() => {
    const moves = movesRef.current;
    const myColor = gameRef.current.myColor;
    if (!myColor) return;

    if (plyIndex >= moves.length) return; // вже на кінці

    const newPly = plyIndex + 1;
    setPlyIndex(newPly);

    if (newPly === moves.length) {
      // Повернулись до live — показуємо live стан
      setGame(g => ({ ...g })); // тригер ре-рендеру
    }
  }, [plyIndex]);

  // ─── PREV через rebuild (по скрипту) ──────────────────
  const goPrev = useCallback(() => {
    const myColor = gameRef.current.myColor;
    if (!myColor) return;
    if (plyIndex === 0) return;
    setPlyIndex(p => p - 1);
  }, [plyIndex]);

  // ─── JUMP(K) ──────────────────────────────────────────
  const jumpTo = useCallback((k) => {
    const moves = movesRef.current;
    const clamped = Math.max(0, Math.min(k, moves.length));
    setPlyIndex(clamped);
  }, []);

  const findGame = useCallback(() => emit('find_game'), [emit]);
  const handleNewGame = useCallback(() => {
    movesRef.current = [];
    gameRef.current = EMPTY_STATE;
    setPlyIndex(0);
    setGame(EMPTY_STATE);
    setScreen('lobby');
  }, []);

  // ─── Що показуємо ─────────────────────────────────────
  const myColor = game.myColor;
  const isLive  = plyIndex === movesRef.current.length;

  // Якщо live — беремо з gameRef (актуальний стан з сервера)
  // Якщо replay — rebuild на льоту
  let displayPieces, displayVisible, displayFog, displayLastMove, displayTurn;

  if (isLive || !myColor) {
    displayPieces    = game.pieces;
    displayVisible   = game.visibleSquares;
    displayFog       = game.fogSquares;
    displayLastMove  = game.lastMove;
    displayTurn      = game.turnColor;
  } else {
    // Rebuild по скрипту
    const replayState = renderAtPly(plyIndex, myColor);
    displayPieces    = replayState.pieces;
    displayVisible   = replayState.visibleSquares;
    displayFog       = replayState.fogSquares;
    displayLastMove  = replayState.lastMove;
    displayTurn      = null; // в replay ходити не можна
  }

  const oppColor = myColor === 'white' ? 'black' : 'white';
  const canGoPrev = plyIndex > 0;
  const canGoNext = plyIndex < movesRef.current.length;

  return (
    <div className={styles.root}>

      {(screen === 'lobby' || screen === 'waiting') && (
        <div className={styles.lobby}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>♟</span>
            <div>
              <div className={styles.logoTitle}>Fog of War Chess</div>
              <div className={styles.logoBadge}>HARDCORE</div>
            </div>
          </div>
          <FogPreview />
          <div className={styles.rules}>
            <p>Ви бачите <strong>тільки</strong> клітинки які атакують ваші фігури.</p>
            <p>Шах <em>не повідомляється</em> — ви можете не знати що під шахом.</p>
          </div>
          <button className={styles.playBtn} onClick={findGame} disabled={screen === 'waiting'}>
            {screen === 'waiting' ? '⏳ Шукаємо суперника...' : 'Знайти гру'}
          </button>
        </div>
      )}

      {(screen === 'playing' || screen === 'gameover') && myColor && (
        <div className={styles.game}>
          <PlayerBar
            color={oppColor} name="Суперник"
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
            color={myColor} name="Ви"
            isActive={game.turnColor === myColor && screen === 'playing' && isLive}
          />

          {/* Навігація */}
          <div className={styles.controls}>
            <button className={styles.navBtn} onClick={goPrev} disabled={!canGoPrev}>◀</button>

            <span className={styles.moveCounter}>
              {!isLive ? (
                <>
                  Хід {plyIndex} / {movesRef.current.length}
                  <button className={styles.liveBtn} onClick={() => jumpTo(movesRef.current.length)}>
                    Live ●
                  </button>
                </>
              ) : `Хід ${movesRef.current.length}`}
            </span>

            <button className={styles.navBtn} onClick={goNext} disabled={!canGoNext}>▶</button>
          </div>

          {screen === 'playing' && isLive && (
            <button className={styles.resignBtn} onClick={() => emit('resign', { gameId: game.gameId })}>
              Здатись
            </button>
          )}
        </div>
      )}

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
  chess.moves({ verbose: true }).forEach(m => {
    if (!visibleSquares.has(m.from)) return;
    if (!dests.has(m.from)) dests.set(m.from, []);
    dests.get(m.from).push(m.to);
  });
  return dests;
}

function FogPreview() {
  const squares = [];
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const light = (r + f) % 2 === 0;
      const fog   = Math.random() > 0.38;
      squares.push(
        <div key={`${r}${f}`} style={{ backgroundColor: light ? '#f0d9b5' : '#b58863', position: 'relative' }}>
          {fog && <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(rgba(14,13,11,0.93),rgba(8,8,8,0.97))' }} />}
        </div>
      );
    }
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)',
      width: '240px', height: '240px', border: '3px solid #4a3a2a',
      borderRadius: '3px', overflow: 'hidden', opacity: 0.7,
    }}>
      {squares}
    </div>
  );
}
