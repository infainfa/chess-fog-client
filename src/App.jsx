import React, { useState, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard }    from './components/ChessBoard.jsx';
import { PlayerBar }     from './components/PlayerBar.jsx';
import { LoginScreen }   from './components/LoginScreen.jsx';
import { useSocket }     from './hooks/useSocket.js';
import { useAuth }       from './context/AuthContext.jsx';
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
  capturedByMe: [], capturedByOpp: [], fullBoard: null,
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
  board.forEach((row, ri) => {
    row.forEach((sq, ci) => {
      if (!sq) return;
      const file = String.fromCharCode(97 + ci);
      const rank = 8 - ri;
      const key  = `${file}${rank}`;
      const isVisible = noFog || visibleSquares?.has(key);
      if (sq.color === myC || isVisible) {
        pieces.set(key, { role: ROLES[sq.type], color: sq.color === 'w' ? 'white' : 'black' });
      }
    });
  });
  return pieces;
}

function buildFogSquares(board, visibleSquares, myColor, noFog = false) {
  if (noFog) return new Set();
  const fog = new Set();
  const myC = myColor === 'white' ? 'w' : 'b';
  board.forEach((row, ri) => {
    row.forEach((sq, ci) => {
      const file = String.fromCharCode(97 + ci);
      const rank = 8 - ri;
      const key  = `${file}${rank}`;
      const isMyPiece   = sq && sq.color === myC;
      const isVisible   = visibleSquares?.has(key);
      if (!isMyPiece && !isVisible) fog.add(key);
    });
  });
  return fog;
}

function buildDests(chess, myColor) {
  const dests = new Map();
  const myC   = myColor === 'white' ? 'w' : 'b';
  const FILES = 'abcdefgh';
  const DIRS  = {
    r: [[1,0],[-1,0],[0,1],[0,-1]],
    b: [[1,1],[1,-1],[-1,1],[-1,-1]],
    q: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],
    n: [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]],
    k: [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],
  };

  const board = chess.board();
  const fen   = chess.fen().split(' ');
  const castling = fen[2];
  const epSquare = fen[3];

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (!piece || piece.color !== myC) continue;

      const from  = FILES[file] + (8 - rank);
      const moves = [];

      if (piece.type === 'p') {
        const dir   = myC === 'w' ? -1 : 1;
        const start = myC === 'w' ? 6 : 1;
        const r1    = rank + dir;
        if (r1 >= 0 && r1 < 8) {
          if (!board[r1][file]) {
            moves.push(FILES[file] + (8 - r1));
            const r2 = rank + dir * 2;
            if (rank === start && r2 >= 0 && r2 < 8 && !board[r2][file])
              moves.push(FILES[file] + (8 - r2));
          }
          for (const df of [-1, 1]) {
            const ff = file + df;
            if (ff >= 0 && ff < 8) {
              const diag = FILES[ff] + (8 - r1);
              const target = board[r1][ff];
              if ((target && target.color !== myC) || epSquare === diag)
                moves.push(diag);
            }
          }
        }
      } else if (piece.type === 'k') {
        for (const [df, dr] of DIRS.k) {
          const nf = file + df, nr = rank + dr;
          if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
          const t = board[nr][nf];
          if (!t || t.color !== myC) moves.push(FILES[nf] + (8 - nr));
        }
        // Рокіровка
        const kr = myC === 'w' ? 7 : 0;
        if (rank === kr && file === 4) {
          if (castling.includes(myC === 'w' ? 'K' : 'k')
            && !board[kr][5] && !board[kr][6])
            moves.push(FILES[6] + (8 - kr));
          if (castling.includes(myC === 'w' ? 'Q' : 'q')
            && !board[kr][3] && !board[kr][2] && !board[kr][1])
            moves.push(FILES[2] + (8 - kr));
        }
      } else if (piece.type === 'n') {
        for (const [df, dr] of DIRS.n) {
          const nf = file + df, nr = rank + dr;
          if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
          const t = board[nr][nf];
          if (!t || t.color !== myC) moves.push(FILES[nf] + (8 - nr));
        }
      } else {
        for (const [df, dr] of DIRS[piece.type]) {
          let nf = file + df, nr = rank + dr;
          while (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
            const t = board[nr][nf];
            if (t) { if (t.color !== myC) moves.push(FILES[nf] + (8 - nr)); break; }
            moves.push(FILES[nf] + (8 - nr));
            nf += df; nr += dr;
          }
        }
      }

      if (moves.length) dests.set(from, moves);
    }
  }
  return dests;
}

// Fog preview for lobby
const FOG_PREVIEW_SQUARES = [
  ['','','fog','fog','fog','fog','fog','fog'],
  ['','','fog','fog','fog','fog','fog','fog'],
  ['fog','fog','fog','fog','fog','fog','fog','fog'],
  ['fog','fog','fog','fog','fog','fog','fog','fog'],
  ['fog','fog','fog','fog','fog','fog','',''],
  ['fog','fog','fog','fog','fog','fog','',''],
  ['fog','fog','fog','fog','fog','fog','',''],
  ['fog','fog','fog','fog','fog','fog','',''],
];

function FogPreview() {
  const squares = useRef(
    Array.from({ length: 64 }, () => Math.random() > 0.45)
  );

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(8,28px)', gap:0, border:'1px solid #333' }}>
      {squares.current.map((isFog, i) => (
        <div key={i} style={{
          width:28, height:28,
          background: isFog
            ? 'rgba(10,10,10,0.82)'
            : ((Math.floor(i/8) + i%8) % 2 === 0 ? '#b0b0b0' : '#6e6e6e'),
        }}/>
      ))}
    </div>
  );
}

function PawnRules() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{marginTop:4}}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:12,padding:0,letterSpacing:'0.04em'}}
      >
        {open ? '▾' : '▸'} ♟️ pawn visibility rules
      </button>
      {open && (
        <div style={{color:'#555',fontSize:11,marginTop:6,lineHeight:1.6,paddingLeft:12}}>
          <p>• A pawn attacks diagonally, so it sees the two squares ahead-diagonal.</p>
          <p>• It does NOT see the square directly in front of it.</p>
          <p>• An enemy pawn that is directly in front of you is invisible until you move aside or another piece reveals it.</p>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { user, profile, loading, signOut } = useAuth();

  const [screen,     setScreen]     = useState('lobby');
  const [game,       setGame]       = useState(EMPTY_STATE);
  const [plyIndex,   setPlyIndex]   = useState(0);
  const [fogEnabled, setFogEnabled] = useState(true);
  const [flipped,    setFlipped]    = useState(false);

  const gameRef  = useRef(EMPTY_STATE);
  const movesRef = useRef([]);

  const history = movesRef.current;
  const isLive  = plyIndex === history.length;

  const { emit } = useSocket({
    onConnect() {},
    onDisconnect() {},

    onWaiting() {
      setScreen('waiting');
    },

    onGameStart({ gameId, color, board, visibleSquares, turn, fen }) {console.log('[gameStart] color:', color, 'visible:', visibleSquares?.length, 'board:', !!board);
      const chess    = new Chess(fen || undefined);
      const myColor  = color;
      const visible  = new Set(visibleSquares);
      const pieces   = buildPiecesWithFog(board || chess.board(), visible, myColor);
      const fog      = buildFogSquares(board || chess.board(), visible, myColor);
      const dests    = turn === myColor ? buildDests(chess, myColor, visible) : new Map();

      movesRef.current = [];
      const newState = {
        ...EMPTY_STATE,
        gameId, myColor,
        turnColor: turn,
        pieces, visibleSquares: visible, fogSquares: fog, dests,
        startFen: fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      };
      gameRef.current = newState;
      setGame(newState);
      setPlyIndex(0);
      setFogEnabled(true);
      setFlipped(false);
      setScreen('playing');
    },

    onMoveMade({ move, fen, turn, board, visibleSquares, isGameOver, isCheckmate, isStalemate, winner, fullBoard }) {
      movesRef.current = [...movesRef.current, move];

      setGame(prev => {
        const myColor  = prev.myColor;
        let chess;
        try { chess = new Chess(fen); } catch { chess = null; }
        const visible  = new Set(visibleSquares);
        const pieces = buildPiecesWithFog(board, visible, myColor);
        const fog    = buildFogSquares(board, visible, myColor);
        const savedFullBoard = fullBoard || prev.fullBoard;
        const dests  = (!isGameOver && chess && turn === myColor) ? buildDests(chess, myColor, visible) : new Map();
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
            capturedByMe.push({ type: move.captured, color: oppC2 });
          } else {
            capturedByOpp.push({ type: move.captured, color: myC2 });
          }
        }

        const newState = { ...prev, turnColor: turn, pieces, visibleSquares: visible, fogSquares: fog, dests, lastMove: move, gameOver, fullBoard: savedFullBoard, capturedByMe, capturedByOpp };
        gameRef.current = newState;
        return newState;
      });

      setPlyIndex(movesRef.current.length);

      if (isGameOver) setScreen('gameover');
    },

    onGameOver({ winner, reason }) {
      setGame(prev => {
        const updated = { ...prev, gameOver: { winner, reason } };
        gameRef.current = updated;
        return updated;
      });
      setScreen('gameover');
    },

    onError({ message }) {
      console.error('[server error]', message);
    },
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

  const myCaptured  = game.capturedByMe  || [];
  const oppCaptured = game.capturedByOpp || [];

  const noFog     = !fogEnabled;
  const viewColor = flipped ? oppColor : myColor;
  const isGameOver = screen === 'gameover';

  let displayPieces, displayFog, displayLastMove, displayTurn;
  if (myColor) {
    if (isLive) {
  if (noFog) {
    // Показуємо всі фігури які є в game.pieces але ігноруємо туман
    displayPieces   = game.pieces;
    displayFog      = new Set();
  } else {
    displayPieces   = game.pieces;
    displayFog      = game.fogSquares;
  }
  displayLastMove = game.lastMove;
  displayTurn     = game.turnColor;
    } else {
      const r = (() => {
        const chess2 = rebuildPosition(game.startFen, movesRef.current, plyIndex);
        const visible = getVisibleSquares(chess2.board(), myColor === 'white' ? 'w' : 'b');
        return {
          pieces:    buildPiecesWithFog(chess2.board(), visible, myColor, noFog),
          fogSquares: noFog ? new Set() : buildFogSquares(chess2.board(), visible, myColor),
          lastMove:  plyIndex > 0 ? movesRef.current[plyIndex - 1] : null,
        };
      })();
      displayPieces   = r.pieces;
      displayFog      = r.fogSquares;
      displayLastMove = r.lastMove;
      displayTurn     = null;
    }
  }

  const canGoPrev = plyIndex > 0;
  const canGoNext = plyIndex < movesRef.current.length;
  const moveNum   = isLive ? history.length : plyIndex;

  // Показуємо логін якщо користувач не авторизований
  if (!loading && !user) {
    return <LoginScreen />;
  }

  // Завантаження
  if (loading) {
    return (
      <div style={{ minHeight:'100svh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0a0a0a' }}>
        <p style={{ color:'#444', letterSpacing:'0.1em', fontSize:13 }}>LOADING…</p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <img src="/fog-of-chess-logo.png" alt="Fog of Chess" className={styles.headerLogo} />
        {/* Профіль користувача */}
        {profile && (
          <div style={{ display:'flex', alignItems:'center', gap:10, marginLeft:'auto' }}>
            {profile.avatar && (
              <img src={profile.avatar} alt="" style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover' }} />
            )}
            <span style={{ color:'#555', fontSize:12, letterSpacing:'0.04em' }}>{profile.username}</span>
            <button
              onClick={signOut}
              style={{ background:'none', border:'none', color:'#444', fontSize:11, cursor:'pointer', letterSpacing:'0.04em' }}
            >
              sign out
            </button>
          </div>
        )}
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
            name={screen === 'playing' ? 'Opponent' : 'Opponent'}
            isActive={game.turnColor === oppColor && screen === 'playing' && isLive}
            capturedPieces={oppCaptured}
          />

          <ChessBoard
            pieces={displayPieces}
            fogSquares={displayFog}
            lastMove={displayLastMove}
            dests={isLive && screen === 'playing' ? game.dests : new Map()}
            onMove={handleMove}
            orientation={viewColor}
            turnColor={displayTurn}
          />

          <PlayerBar
            color={flipped ? oppColor : myColor}
            name={profile?.username || 'You'}
            isActive={game.turnColor === myColor && screen === 'playing' && isLive}
            capturedPieces={myCaptured}
          />

          {/* Навігація по ходах */}
          <div className={styles.moveNav}>
            <button onClick={goPrev} disabled={!canGoPrev}>◀</button>
            <span>{moveNum}</span>
            <button onClick={goNext} disabled={!canGoNext}>▶</button>
          </div>

          {/* Пост-гейм кнопки */}
          {isGameOver && (
            <div className={styles.postGame}>
              {game.gameOver && (
                <p className={styles.gameResult}>
                  {game.gameOver.winner === myColor ? '👑 You Won' :
                   game.gameOver.winner === null    ? 'Draw'       : 'You Lost'}
                </p>
              )}
              <button className={styles.dispelBtn} onClick={() => setFogEnabled(f => !f)}>
                {fogEnabled ? '☁️ Dispel the Fog' : '🌫️ Restore Fog'}
              </button>
              <button className={styles.flipBtn} onClick={() => setFlipped(f => !f)}>
                ⇅ Flip Board
              </button>
              <button className={styles.newGameBtn} onClick={handleNewGame}>
                New Game
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
