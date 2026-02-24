import styles from './GameOverModal.module.css';

const REASON_LABELS = {
  checkmate:  'Мат',
  resign:     'Здача',
  disconnect: 'Суперник відключився',
  stalemate:  'Пат — нічия',
  timeout:    'Час вичерпано',
};

export function GameOverModal({ winner, reason, myColor, onNewGame }) {
  const iWon = winner === myColor;
  const isDraw = !winner;

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.icon}>
          {isDraw ? '🤝' : iWon ? '♛' : '♙'}
        </div>

        <div className={styles.result}>
          {isDraw
            ? 'Нічия!'
            : iWon
            ? 'Ви перемогли!'
            : 'Ви програли'}
        </div>

        <div className={styles.reason}>
          {REASON_LABELS[reason] || reason}
        </div>

        <button className={styles.btn} onClick={onNewGame}>
          Нова гра
        </button>
      </div>
    </div>
  );
}
