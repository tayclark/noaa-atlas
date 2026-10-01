import { useCallback, useSyncExternalStore } from 'react'
import { getTimeSnapshot, startPlayer, stopPlayer, subscribeTime, type PlayerId } from '../../data/timeStore'

/** Whether this control owns the shared playback (#74), and a setter that hands it over or gives it up. */
export function usePlayer(id: PlayerId): [boolean, (play: boolean) => void] {
  const playing = useSyncExternalStore(subscribeTime, () => getTimeSnapshot().player === id)
  const set = useCallback((play: boolean) => (play ? startPlayer(id) : stopPlayer(id)), [id])
  return [playing, set]
}
