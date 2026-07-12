// Minimal typings for the untyped `player.js` package (Bunny's embed player is
// Player.js-compatible). We only use construction + on/off for timeupdate/ended.
declare module "player.js" {
  export interface PlayerEvent {
    seconds?: number;
    duration?: number;
  }
  export class Player {
    constructor(element: HTMLIFrameElement | HTMLElement | string);
    on(event: string, callback: (data?: PlayerEvent) => void): void;
    off(event: string): void;
  }
  const playerjs: { Player: typeof Player };
  export default playerjs;
}
