import { useEffect, useRef, useCallback } from 'react';
import { Chessground } from 'chessground';

/**
 * useChessground
 *
 * Ініціалізує chessground на переданому DOM-елементі і повертає
 * api для оновлення стану дошки.
 *
 * @param {React.RefObject} containerRef - ref на <div> контейнер
 * @param {Object} options
 * @param {Function} options.onMove - викликається коли гравець робить хід: (from, to) => void
 */
export function useChessground(containerRef, { onMove }) {
  const cgRef = useRef(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    if (!containerRef.current) return;

    const cg = Chessground(containerRef.current, {
      // Початкова конфігурація — мінімальна, решту встановлюємо через .set()
      animation: { enabled: true, duration: 200 },
      highlight: { lastMove: true, check: false }, // check: false — hardcore fog
      movable: {
        free: false,
        color: undefined, // встановимо після game_start
        showDests: true,
        events: {
          after: (from, to) => onMoveRef.current?.(from, to),
        },
      },
      premovable: { enabled: false }, // вимкнено для fog режиму
      drawable: { enabled: true },    // можна малювати стрілки
      coordinates: true,
      resizable: true,
    });

    cgRef.current = cg;

    return () => {
      cg.destroy();
      cgRef.current = null;
    };
  }, [containerRef]);

  /**
   * Оновлює стан дошки.
   * Викликати після кожного ходу або game_start.
   */
  const updateBoard = useCallback(({
    pieces,          // Map<square, {role, color}> — видимі фігури
    fogSquares,      // Set<square> — клітинки в тумані (для overlay)
    turnColor,       // 'white' | 'black'
    myColor,         // 'white' | 'black' — колір гравця
    dests,           // Map<square, square[]> — валідні ходи
    lastMove,        // [from, to] | undefined
    check,           // square | false — НЕ передаємо в hardcore режимі
  }) => {
    const cg = cgRef.current;
    if (!cg) return;

    cg.set({
      orientation: myColor,
      turnColor,
      movable: {
        color: turnColor === myColor ? myColor : undefined,
        dests: dests || new Map(),
      },
      lastMove: lastMove || undefined,
      check: false, // HARDCORE: завжди false
      pieces,
    });
  }, []);

  /**
   * Показує дозволені ходи для клітинки (після запиту до сервера)
   */
  const setDests = useCallback((dests) => {
    cgRef.current?.set({ movable: { dests } });
  }, []);

  /**
   * Анімує хід суперника
   */
  const animateMove = useCallback((from, to) => {
    cgRef.current?.move(from, to);
  }, []);

  return { updateBoard, setDests, animateMove, cgRef };
}
