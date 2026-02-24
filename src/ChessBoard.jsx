import { useRef, useEffect } from 'react';
import { useChessground } from '../hooks/useChessground.js';
import { FogOverlay } from './FogOverlay.jsx';

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

  return (
    <div
      ref={wrapRef}
      style={{
        // Квадрат: береме менше з ширини і висоти екрану
        width:        'min(92vw, calc(100svh - 220px))',
        aspectRatio:  '1 / 1',
        position:     'relative',
        borderRadius: '3px',
        overflow:     'hidden',
        boxShadow:    '0 8px 40px rgba(0,0,0,0.7)',
        flexShrink:   0,
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
  );
}
