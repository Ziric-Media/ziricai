/** @type {{ consumerProfile: object|null, preferences: object|null, firebaseUser: import('firebase/auth').User|null }} */
export const state = {
  consumerProfile: null,
  preferences: null,
  firebaseUser: null,
};

export function setState(partial) {
  Object.assign(state, partial);
}
