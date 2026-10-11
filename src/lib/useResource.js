import { useCallback, useEffect, useRef, useState } from 'react';

// Load data once (and on demand). Ignores responses that arrive after unmount or
// after a newer request, and never substitutes placeholder data on failure.
export default function useResource(load, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);

  const reload = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await run();
      if (id === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id === seq.current) setState((s) => ({ ...s, error, loading: false }));
    }
  }, [run]);

  useEffect(() => {
    reload();
    return () => { seq.current += 1; };
  }, [reload]);

  return { ...state, reload };
}
