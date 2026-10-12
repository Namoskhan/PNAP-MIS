import React, { useState } from 'react';

// Common political, administrative, and reporting words used in PNAP proforma reports
const QUICK_WORDS = [
  'فعاله',
  'غير فعاله',
  'حاضر',
  'غير حاضر',
  'رخصت',
  'غونډه',
  'جلسه',
  'مظاهره',
  'سيمينار',
  'سټډي سرکل',
  'چنده',
  'دوره',
  'مطالعه',
  'پريس کانفرنس',
  'شموليت',
  'مرستيال',
  'سکرټري',
  'صوبائي',
  'ضلعي',
  'علاقائي',
  'ابتدائي يونټ',
  'پښتونخوا',
  'ملګري',
  'کامياب',
  'ناتمامه',
];

// Distinctive Pashto characters that are usually missing on standard Urdu/Arabic or English keyboards
const PASHTO_SPECIAL_LETTERS = ['ښ', 'ځ', 'څ', 'ډ', 'ړ', 'ږ', 'ڼ', 'ۍ', 'ې', 'ئ', 'ټ', 'ګ', 'آ', 'ء'];

// Full Pashto alphabet layout
const PASHTO_ALPHABET_ROWS = [
  ['آ', 'ا', 'ب', 'پ', 'ت', 'ټ', 'ث', 'ج', 'چ', 'ح', 'خ', 'ځ', 'څ'],
  ['د', 'ډ', 'ذ', 'ر', 'ړ', 'ز', 'ژ', 'ږ', 'س', 'ش', 'ښ', 'ص', 'ض'],
  ['ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ک', 'ګ', 'ل', 'م', 'ن', 'ڼ'],
  ['و', 'ه', 'ی', 'ي', 'ې', 'ۍ', 'ئ', '،', '؟', '۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'],
];

export default function PashtoKeyboardHelper({ activeElementRef, onInsertText }) {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState('words'); // 'words' | 'special' | 'keyboard'

  function handleInsert(str) {
    if (onInsertText) {
      onInsertText(str);
      return;
    }

    const el = activeElementRef?.current || document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const val = el.value || '';
      const before = val.substring(0, start);
      const after = val.substring(end);
      const insertWithSpace = (tab === 'words' && !before.endsWith(' ') && before.length > 0) ? ` ${str} ` : str;
      const nextVal = before + insertWithSpace + after;

      // React synthetic event trigger
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

      if (nativeSetter) {
        nativeSetter.call(el, nextVal);
      } else {
        el.value = nextVal;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
      const nextPos = start + insertWithSpace.length;
      el.setSelectionRange(nextPos, nextPos);
    }
  }

  function handleBackspace() {
    const el = activeElementRef?.current || document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const val = el.value || '';
      if (start === end && start > 0) {
        const nextVal = val.substring(0, start - 1) + val.substring(end);
        el.value = nextVal;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.focus();
        el.setSelectionRange(start - 1, start - 1);
      } else if (start !== end) {
        const nextVal = val.substring(0, start) + val.substring(end);
        el.value = nextVal;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.focus();
        el.setSelectionRange(start, start);
      }
    }
  }

  return (
    <div
      style={{
        margin: '12px 0',
        padding: 12,
        borderRadius: 10,
        background: 'var(--surface, #1e293b)',
        border: '1px solid var(--border, #334155)',
        direction: 'rtl',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>⌨️</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text, #f8fafc)' }}>
            د پښتو ليکلو مرستيال او الفاظ (Pashto Input & Quick Words)
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12, padding: '4px 10px', height: 28 }}
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? 'پټول ▲ (Hide)' : 'ښکاره کول ▼ (Show Tools)'}
          </button>
        </div>
      </div>

      {isOpen && (
        <div style={{ marginTop: 10 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button
              type="button"
              className={`btn ${tab === 'words' ? '' : 'secondary'}`}
              style={{ fontSize: 12, padding: '4px 12px', height: 28 }}
              onClick={() => setTab('words')}
            >
              عام الفاظ (Quick Words)
            </button>
            <button
              type="button"
              className={`btn ${tab === 'special' ? '' : 'secondary'}`}
              style={{ fontSize: 12, padding: '4px 12px', height: 28 }}
              onClick={() => setTab('special')}
            >
              ځانګړي پښتو توري (Special Letters)
            </button>
            <button
              type="button"
              className={`btn ${tab === 'keyboard' ? '' : 'secondary'}`}
              style={{ fontSize: 12, padding: '4px 12px', height: 28 }}
              onClick={() => setTab('keyboard')}
            >
              مکمل کیبورډ (Full Keyboard)
            </button>
          </div>

          {/* Quick Words View */}
          {tab === 'words' && (
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-soft, #94a3b8)' }}>
                په لاندې تڼۍ کليک وکړئ ترڅو لفظ په فعال فيلډ کې داخل شي:
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {QUICK_WORDS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleInsert(w)}
                    style={{
                      background: 'var(--surface-alt, #0f172a)',
                      color: 'var(--text, #f8fafc)',
                      border: '1px solid var(--border, #475569)',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 13,
                      cursor: 'pointer',
                      fontFamily: "'Noto Naskh Arabic', sans-serif",
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pashto Special Letters View */}
          {tab === 'special' && (
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-soft, #94a3b8)' }}>
                پښتو ځانګړي حروف چې په عمومي کي بورډ کې نه وي:
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {PASHTO_SPECIAL_LETTERS.map((letter) => (
                  <button
                    key={letter}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleInsert(letter)}
                    style={{
                      background: 'var(--surface-alt, #0f172a)',
                      color: '#38bdf8',
                      fontWeight: 700,
                      border: '1.5px solid #0284c7',
                      borderRadius: 6,
                      width: 40,
                      height: 38,
                      fontSize: 18,
                      cursor: 'pointer',
                      fontFamily: "'Noto Naskh Arabic', sans-serif",
                    }}
                  >
                    {letter}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Full Keyboard View */}
          {tab === 'keyboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PASHTO_ALPHABET_ROWS.map((row, rIdx) => (
                <div key={rIdx} style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {row.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleInsert(ch)}
                      style={{
                        background: 'var(--surface-alt, #0f172a)',
                        color: 'var(--text, #f8fafc)',
                        border: '1px solid var(--border, #334155)',
                        borderRadius: 5,
                        minWidth: 32,
                        height: 34,
                        padding: '0 6px',
                        fontSize: 15,
                        cursor: 'pointer',
                        fontFamily: "'Noto Naskh Arabic', sans-serif",
                      }}
                    >
                      {ch}
                    </button>
                  ))}
                  {rIdx === PASHTO_ALPHABET_ROWS.length - 1 && (
                    <>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleInsert(' ')}
                        style={{
                          background: 'var(--surface-alt, #0f172a)',
                          color: 'var(--text-soft, #94a3b8)',
                          border: '1px solid var(--border, #334155)',
                          borderRadius: 5,
                          minWidth: 60,
                          height: 34,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        Space (فاصله)
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handleBackspace}
                        style={{
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 5,
                          minWidth: 44,
                          height: 34,
                          fontSize: 14,
                          cursor: 'pointer',
                        }}
                      >
                        ⌫
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
