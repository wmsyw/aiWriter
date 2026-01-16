'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseFetchOptions<T> {
  immediate?: boolean;
  initialData?: T;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  transform?: (data: unknown) => T;
}

interface UseFetchResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  mutate: (newData: T | ((prev: T | null) => T)) => void;
}

export function useFetch<T = unknown>(
  url: string | null,
  options: UseFetchOptions<T> = {}
): UseFetchResult<T> {
  const {
    immediate = true,
    initialData = null,
    onSuccess,
    onError,
    transform,
  } = options;

  const [data, setData] = useState<T | null>(initialData);
  const [isLoading, setIsLoading] = useState(immediate && url !== null);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!url) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(url, { signal });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const rawData = await res.json();
      const transformedData = optionsRef.current.transform
        ? optionsRef.current.transform(rawData)
        : (rawData as T);

      if (isMountedRef.current) {
        setData(transformedData);
        optionsRef.current.onSuccess?.(transformedData);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      const errorObj = err instanceof Error ? err : new Error(String(err));
      if (isMountedRef.current) {
        setError(errorObj);
        optionsRef.current.onError?.(errorObj);
        console.error('Fetch error:', errorObj);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [url]);

  const refetch = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    await fetchData(abortControllerRef.current.signal);
  }, [fetchData]);

  const mutate = useCallback((newData: T | ((prev: T | null) => T)) => {
    setData((prev) =>
      typeof newData === 'function'
        ? (newData as (prev: T | null) => T)(prev)
        : newData
    );
  }, []);

  useEffect(() => {
    if (!immediate || !url) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    fetchData(controller.signal);

    return () => {
      controller.abort();
    };
  }, [url, immediate, fetchData]);

  return {
    data,
    isLoading,
    error,
    refetch,
    mutate,
  };
}

interface UseMutationOptions<TData, TVariables> {
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
}

interface UseMutationResult<TData, TVariables> {
  mutate: (variables: TVariables) => Promise<TData | null>;
  data: TData | null;
  isLoading: boolean;
  error: Error | null;
  reset: () => void;
}

export function useMutation<TData = unknown, TVariables = unknown>(
  mutationFn: (variables: TVariables) => Promise<Response>,
  options: UseMutationOptions<TData, TVariables> = {}
): UseMutationResult<TData, TVariables> {
  const [data, setData] = useState<TData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const res = await mutationFn(variables);

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const responseData = (await res.json()) as TData;
        
        if (isMountedRef.current) {
          setData(responseData);
          optionsRef.current.onSuccess?.(responseData, variables);
        }
        return responseData;
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        if (isMountedRef.current) {
          setError(errorObj);
          optionsRef.current.onError?.(errorObj, variables);
        }
        console.error('Mutation error:', errorObj);
        return null;
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [mutationFn]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    mutate,
    data,
    isLoading,
    error,
    reset,
  };
}

export default useFetch;
