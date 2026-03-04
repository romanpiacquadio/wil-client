export interface StartCallConfig {
  userName: string;
  googleToken: string;
  prompt: string;
}

export const DEFAULT_START_CALL_CONFIG: StartCallConfig = {
  userName: 'Fran',
  googleToken: '',
  prompt: '',
};
