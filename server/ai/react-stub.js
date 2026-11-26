// React wordt in de AI-bundel niet gebruikt (alleen de rekenfuncties); hooks zijn hier lege stubs.
export const useState = (v) => [typeof v === 'function' ? v() : v, () => {}];
export const useEffect = () => {};
export const useMemo = (f) => f();
export const useCallback = (f) => f;
export const useRef = (v) => ({ current: v });
export const createContext = () => ({});
export const useContext = () => ({});
export default { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext };
