import { setNeedColours, useNeedColours } from './needLook'

/** On/off switch for the need stripes, bottom right of the canvas. */
export function NeedColoursSwitch() {
  const on = useNeedColours()
  return (
    <button
      type="button"
      className="toc-need-switch"
      aria-pressed={on}
      onClick={() => setNeedColours(!on)}
    >
      Need colours {on ? 'on' : 'off'}
    </button>
  )
}
