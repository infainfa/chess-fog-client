import { useRef, useEffect } from 'react';
import { useChessground } from '../hooks/useChessground.js';
import { FogOverlay } from './FogOverlay.jsx';

export function ChessBoard({
  pieces,
  visibleSquares,  // fogSquares (Set) — клітинки під туманом
  myColor = 'white',
  turnColor = 'white',
  dests,
  lastMove,
  onMove,
}) {
  const containerRef = useRef(null);
  const { updateBoard } = useChessground(containerRef, { onMove });

  useEffect(() => {
    if (!pieces) return;
    updateBoard({
      pieces,
      turnColor: turnColor || 'white',
      myColor,
      dests: dests || new Map(),
      lastMove: lastMove ? [lastMove.from, lastMove.to] : undefined,
      check: false,
    });
  }, [pieces, turnColor, myColor, dests, lastMove, updateBoard]);

  return (
    <div style={{
      width: 'min(88vw, 75svh, 560px)',
      aspectRatio: '1',
      position: 'relative',
      borderRadius: '3px',
      overflow: 'hidden',
      boxShadow: '0 12px 50px rgba(0,0,0,0.7)',
    }}>
      <div ref={containerRef} className="cg-wrap" style={{ width: '100%', height: '100%' }} />
      <FogOverlay fogSquares={visibleSquares} orientation={myColor} />
    </div>
  );
}
