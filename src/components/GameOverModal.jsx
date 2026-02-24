import styles from './GameOverModal.module.css';

const REASON_LABELS = {
  checkmate:  'Checkmate',
  resign:     'Resignation',
  disconnect: 'Opponent disconnected',
  stalemate:  'Stalemate — Draw',
  timeout:    'Time out',
  unknown:    'Game over',
};

export function GameOverModal({ winner, reason, myColor, onNewGame }) {
  const iWon  = winner === myColor;
  const isDraw = !winner;

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.icon}>
          {isDraw ? '🤝' : iWon ? '♛' : '♟'}
        </div>

        <div className={styles.result}>
          {isDraw ? 'Draw' : iWon ? 'You Won' : 'You Lost'}
        </div>

        <div className={styles.reason}>
          {REASON_LABELS[reason] || reason}
        </div>

        <button className={styles.btn} onClick={onNewGame}>
          New Game
        </button>
      </div>
    </div>
  );
}
