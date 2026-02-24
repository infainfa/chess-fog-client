import { useEffect, useRef, useCallback } from 'react';
import { Chessground } from 'chessground';

export function useChessground(containerRef, { onMove }) {
  const cgRef    = useRef(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    if (!containerRef.current) return;

    const cg = Chessground(containerRef.current, {
      animation:   { enabled: true, duration: 200 },
      highlight:   { lastMove: true, check: false },
      movable: {
        free:      false,
        color:     undefined,
        showDests: true,
        events:    { after: (from, to) => onMoveRef.current?.(from, to) },
      },
      premovable:  { enabled: false },
      drawable:    { enabled: true },
      coordinates: false,
      resizable:   true,
    });

    cgRef.current = cg;

    // Перемалювати коли контейнер змінює розмір (мобільний rotate, resize)
    const ro = new ResizeObserver(() => {
      cgRef.current?.redrawAll();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      cg.destroy();
      cgRef.current = null;
    };
  }, [containerRef]);

  const updateBoard = useCallback(({
    pieces, turnColor, myColor, dests, lastMove,
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
      check:    false,
      pieces,
    });

    // Примусово перемалювати після оновлення
    cg.redrawAll();
  }, []);

  return { updateBoard, cgRef };
}
