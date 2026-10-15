import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/** GET `path` and keep { data, loading, error }. Pass a falsy path to skip. `reload()` refetches. */
export function useApi(path) {
  const [state, setState] = useState({ data: null, loading: !!path, error: '' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return undefined;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    api(path)
      .then((data) => live && setState({ data, loading: false, error: '' }))
      .catch((e) => live && setState({ data: null, loading: false, error: e.message }));
    return () => { live = false; };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
