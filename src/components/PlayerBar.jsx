import styles from './PlayerBar.module.css';

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
          <span
            key={i}
            className={styles.capturedPiece}
            style={{ color: p.color === 'w' ? '#e8e8e8' : '#222' }}
          >
            {p.char}
          </span>
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
