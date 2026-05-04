import { X, Bookmark, ExternalLink } from 'lucide-react';

interface BookmarkletModalProps {
  onClose: () => void;
}

export default function BookmarkletModal({ onClose }: BookmarkletModalProps) {
  const stashdUrl = window.location.origin;
  const bookmarkletHref = `javascript:(function(){window.open('${stashdUrl}/add?url='+encodeURIComponent(location.href),'_blank','width=480,height=640')})();`;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-hidden"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-y-contain p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center space-x-2">
            <Bookmark className="w-5 h-5 text-gray-900" />
            <h2 className="text-lg font-semibold text-gray-900">Save from any website</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-5">
          Add this bookmarklet to your browser's bookmarks bar. Then, whenever you find a product you want to save, click it to add it to Stashd instantly.
        </p>

        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Step 1 — Drag this to your bookmarks bar</p>
          <div className="flex justify-center">
            <a
              href={bookmarkletHref}
              onClick={(e) => e.preventDefault()}
              draggable
              className="inline-flex items-center space-x-2 px-5 py-3 bg-gray-900 text-white rounded-xl font-medium text-sm cursor-grab active:cursor-grabbing select-none shadow hover:bg-gray-800 transition-colors"
              title="Drag me to your bookmarks bar"
            >
              <Bookmark className="w-4 h-4" />
              <span>Save to Stashd</span>
            </a>
          </div>
          <p className="text-xs text-gray-400 text-center mt-3">
            Drag the button above to your browser's bookmarks bar
          </p>
        </div>

        <ol className="space-y-2.5 text-sm text-gray-600 mb-5">
          <li className="flex space-x-3">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center font-semibold mt-0.5">2</span>
            <span>Browse to any product page on any website</span>
          </li>
          <li className="flex space-x-3">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center font-semibold mt-0.5">3</span>
            <span>Click the <strong>Save to Stashd</strong> bookmark — a window will open with the product URL already filled in</span>
          </li>
          <li className="flex space-x-3">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-900 text-white text-xs flex items-center justify-center font-semibold mt-0.5">4</span>
            <span>Choose a list and save</span>
          </li>
        </ol>

        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700 flex items-start space-x-2">
          <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>Some browsers show your bookmarks bar via <strong>View → Show Bookmarks Bar</strong> or <strong>Ctrl/Cmd + Shift + B</strong>.</span>
        </div>
      </div>
    </div>
  );
}
