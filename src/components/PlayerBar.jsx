import styles from './PlayerBar.module.css';

const TYPE_MAP = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king'
};

function PieceMini({ type, color }) {
  const role  = TYPE_MAP[type] || type;
  const clr   = color === 'w' ? 'white' : 'black';
  return <div className={`${styles.pieceMini} ${clr} ${role}`} />;
}

export function PlayerBar({ color, name = 'Player', isActive, capturedPieces = [] }) {
  return (
    <div className={`${styles.bar} ${isActive ? styles.active : ''}`}>
      <div className={styles.left}>
        <div className={styles.avatar}>
          {color === 'white' ? '♔' : '♚'}
        </div>
        <span className={styles.name}>{name}</span>
      </div>

      <div className={styles.captured}>
        {capturedPieces.map((p, i) => (
          <PieceMini key={i} type={p.type} color={p.color} />
        ))}
      </div>

      {isActive && (
        <div className={styles.turnIndicator}>
          <span className={styles.dot} />
          YOUR TURN
        </div>
      )}
    </div>
  );
}
