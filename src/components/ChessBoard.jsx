import { useRef, useEffect } from 'react';
import { useChessground } from '../hooks/useChessground.js';
import { FogOverlay } from './FogOverlay.jsx';

const RANKS_WHITE = ['8','7','6','5','4','3','2','1'];
const RANKS_BLACK = ['1','2','3','4','5','6','7','8'];
const FILES_WHITE = ['a','b','c','d','e','f','g','h'];
const FILES_BLACK = ['h','g','f','e','d','c','b','a'];

export function ChessBoard({
  pieces,
  visibleSquares,
  myColor = 'white',
  turnColor = 'white',
  dests,
  lastMove,
  onMove,
}) {
  const wrapRef      = useRef(null);
  const containerRef = useRef(null);
  const { updateBoard } = useChessground(containerRef, { onMove });

  useEffect(() => {
    if (!pieces) return;
    updateBoard({
      pieces,
      turnColor: turnColor || 'white',
      myColor,
      dests:     dests || new Map(),
      lastMove:  lastMove ? [lastMove.from, lastMove.to] : undefined,
    });
  }, [pieces, turnColor, myColor, dests, lastMove, updateBoard]);

  const ranks = myColor === 'white' ? RANKS_WHITE : RANKS_BLACK;
  const files = myColor === 'white' ? FILES_WHITE : FILES_BLACK;

  return (
    <div style={{
      position:   'relative',
      display:    'inline-flex',
      flexShrink: 0,
      // Загальний розмір = дошка + місце для координат
    }}>

      {/* Цифри зліва (ranks) */}
      <div style={{
        display:        'flex',
        flexDirection:  'column',
        justifyContent: 'space-around',
        width:          '16px',
        paddingBottom:  '16px', // щоб вирівняти з буквами знизу
        flexShrink:     0,
      }}>
        {ranks.map(r => (
          <span key={r} style={{
            color:      'rgba(255,255,255,0.4)',
            fontSize:   'clamp(9px, 1.2vw, 12px)',
            fontWeight: 500,
            lineHeight: 1,
            textAlign:  'right',
            paddingRight: '3px',
          }}>{r}</span>
        ))}
      </div>

      {/* Дошка + букви знизу */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>

        {/* Сама дошка */}
        <div
          ref={wrapRef}
          style={{
            width:      'min(88vw, calc(100svh - 260px))',
            height:     'min(88vw, calc(100svh - 260px))',
            position:   'relative',
            flexShrink: 0,
          }}
        >
          <div
            ref={containerRef}
            className="cg-wrap"
            style={{
              position: 'absolute',
              inset:    0,
              width:    '100%',
              height:   '100%',
            }}
          />
          <FogOverlay fogSquares={visibleSquares} orientation={myColor} />
        </div>

        {/* Букви знизу (files) */}
        <div style={{
          display:        'flex',
          flexDirection:  'row',
          justifyContent: 'space-around',
          height:         '16px',
          paddingLeft:    '0',
        }}>
          {files.map(f => (
            <span key={f} style={{
              color:      'rgba(255,255,255,0.4)',
              fontSize:   'clamp(9px, 1.2vw, 12px)',
              fontWeight: 500,
              lineHeight: 1,
              textAlign:  'center',
              flex:       1,
            }}>{f}</span>
          ))}
        </div>

      </div>
    </div>
  );
}
