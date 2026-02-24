import styles from './PlayerBar.module.css';

export function PlayerBar({ color, name = 'Гравець', rating, isActive, capturedPieces = [] }) {
  return (
    <div className={`${styles.bar} ${isActive ? styles.active : ''}`}>
      <div className={styles.avatar}>
        {color === 'white' ? '♔' : '♚'}
      </div>

      <div className={styles.info}>
        <span className={styles.name}>{name}</span>
        {rating && <span className={styles.rating}>{rating}</span>}
      </div>

      {capturedPieces.length > 0 && (
        <div className={styles.captured}>
          {capturedPieces.map((p, i) => (
            <span key={i} className={styles.capturedPiece}>{p}</span>
          ))}
        </div>
      )}

      {isActive && (
        <div className={styles.turnIndicator}>
          <span className={styles.dot} />
          ХІД
        </div>
      )}
    </div>
  );
}
