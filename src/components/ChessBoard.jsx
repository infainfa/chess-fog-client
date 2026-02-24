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

  const size = 'min(92vw, calc(100svh - 240px))';

  return (
    <div
      ref={wrapRef}
      style={{
        width:      size,
        height:     size,
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
  );
}
