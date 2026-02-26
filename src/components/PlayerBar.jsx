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
        {capturedPieces.length > 0
          ? capturedPieces.map((p, i) => (
              <span key={i} className={styles.capturedPiece}>{p}</span>
            ))
          : <span className={styles.capturedEmpty} />
        }
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
