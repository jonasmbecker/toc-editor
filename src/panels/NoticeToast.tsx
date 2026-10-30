import { useToCStore } from '../state/store'
import './notice-toast.css'

/** Faint bottom-centre notice: "Undone: rename node", "These two are already connected". Reads
 * the store's `notice`; `announce()` in `state/notice.ts` is what sets and clears it. */
export function NoticeToast() {
  const message = useToCStore((state) => state.notice)
  if (!message) return null
  return (
    <div className="toc-toast" role="status">
      {message}
    </div>
  )
}
