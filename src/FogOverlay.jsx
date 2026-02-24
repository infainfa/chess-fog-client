import { useMemo } from 'react';

const FILES = ['a','b','c','d','e','f','g','h'];

/**
 * FogOverlay
 * @param {Set<string>} fogSquares - клітинки які треба накрити туманом
 * @param {'white'|'black'} orientation
 */
export function FogOverlay({ fogSquares, orientation = 'white' }) {
  const squares = useMemo(() => {
    if (!fogSquares) return [];
    return [...fogSquares];
  }, [fogSquares]);

  if (!squares.length) return null;

  return (
    <>
      {squares.map(sq => (
        <FogSquare key={sq} sq={sq} orientation={orientation} />
      ))}
    </>
  );
}

function FogSquare({ sq, orientation }) {
  const fileIdx = FILES.indexOf(sq[0]);
  const rankNum = parseInt(sq[1]);

  const left = orientation === 'white' ? fileIdx * 12.5 : (7 - fileIdx) * 12.5;
  const top  = orientation === 'white' ? (8 - rankNum) * 12.5 : (rankNum - 1) * 12.5;

  return (
    <div
      className="fog-square"
      style={{ left: `${left}%`, top: `${top}%`, width: '12.5%', height: '12.5%' }}
    />
  );
}
