import { useState, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BookPage } from './BookPage';
import { getChapterItems } from '../../lib/menuUtils';
import { FOOD_CHAPTERS, DRINKS_CHAPTERS } from '../../constants/chapters';
import { useApp } from '../../context/AppContext';
import type { MenuData, MenuItem, Chapter } from '../../types/menu';
import '../../animations/BookFlip.css';
import styles from './BookViewer.module.css';

interface BookViewerProps {
  menuData: MenuData;
  onItemClick: (item: MenuItem) => void;
  onAddToCart: (item: MenuItem) => void;
  onPairingClick?: (item: MenuItem) => void;
}

interface Spread {
  leftChapter: Chapter;
  rightChapter: Chapter | null;
  leftItems: MenuItem[];
  rightItems: MenuItem[];
}

const PAGE_TURN_MS = 1250;

export function BookViewer({ menuData, onItemClick, onAddToCart, onPairingClick }: BookViewerProps) {
  const { bookType: currentBook, setBookType: setCurrentBook } = useApp();
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [focusSide, setFocusSide] = useState<'left' | 'right'>('left');
  const [isMoving, setIsMoving] = useState(false);
  const [turning, setTurning] = useState<'forward' | 'backward' | null>(null);

  useEffect(() => {
    setSpreadIndex(0);
    setIsOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBook]);

  const allChapters = currentBook === 'food' ? FOOD_CHAPTERS : DRINKS_CHAPTERS;

  const spreads: Spread[] = [];
  for (let i = 0; i < allChapters.length; i += 2) {
    const leftCh = allChapters[i];
    const rightCh = allChapters[i + 1] || null;
    spreads.push({
      leftChapter: leftCh,
      rightChapter: rightCh,
      leftItems: getChapterItems(menuData, leftCh),
      rightItems: rightCh ? getChapterItems(menuData, rightCh) : [],
    });
  }

  const currentSpread = spreads[spreadIndex] || spreads[0];
  const maxSpread = spreads.length - 1;

  const openBook = useCallback(() => {
    if (isMoving || isOpen) return;
    setIsMoving(true);
    setIsOpen(true);
    setTimeout(() => setIsMoving(false), 940);
  }, [isMoving, isOpen]);

  const closeBook = useCallback(() => {
    if (isMoving || !isOpen) return;
    setIsMoving(true);
    setIsOpen(false);
    setTimeout(() => setIsMoving(false), 940);
  }, [isMoving, isOpen]);

  const goNext = useCallback(() => {
    if (isMoving || !isOpen) { openBook(); return; }
    if (focusSide === 'left') { setFocusSide('right'); return; }
    if (spreadIndex >= maxSpread) { closeBook(); return; }
    setIsMoving(true);
    setTurning('forward');
    setTimeout(() => {
      setSpreadIndex(i => Math.min(maxSpread, i + 1));
      setFocusSide('left');
      setTurning(null);
      setIsMoving(false);
    }, PAGE_TURN_MS);
  }, [isMoving, isOpen, focusSide, spreadIndex, maxSpread, openBook, closeBook]);

  const goPrev = useCallback(() => {
    if (isMoving || !isOpen) return;
    if (focusSide === 'right') { setFocusSide('left'); return; }
    if (spreadIndex === 0) { closeBook(); return; }
    setIsMoving(true);
    setTurning('backward');
    setTimeout(() => {
      setSpreadIndex(i => Math.max(0, i - 1));
      setFocusSide('right');
      setTurning(null);
      setIsMoving(false);
    }, PAGE_TURN_MS);
  }, [isMoving, isOpen, focusSide, spreadIndex, closeBook]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'Escape') closeBook();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, closeBook]);

  const bookClasses = [
    'book',
    isOpen ? 'bookOpen' : '',
    isOpen && focusSide === 'left' ? 'focusLeft' : '',
    isOpen && focusSide === 'right' ? 'focusRight' : '',
  ].filter(Boolean).join(' ');

  const turnSheetClasses = [
    'turnSheet',
    turning ? 'turnActive' : '',
    turning === 'forward' ? 'turnForward' : '',
    turning === 'backward' ? 'turnBackward' : '',
  ].filter(Boolean).join(' ');

  const pageCount = spreads.length * 2;
  const currentPage = spreadIndex * 2 + (focusSide === 'right' ? 2 : 1);

  return (
    <div className={styles.wrapper}>
      <div className={styles.bookTypeToggle}>
        <button
          className={`${styles.typeBtn} ${currentBook === 'food' ? styles.typeBtnActive : ''}`}
          onClick={() => setCurrentBook('food')}
          aria-pressed={currentBook === 'food'}
        >
          Food Menu
        </button>
        <button
          className={`${styles.typeBtn} ${currentBook === 'drinks' ? styles.typeBtnActive : ''}`}
          onClick={() => setCurrentBook('drinks')}
          aria-pressed={currentBook === 'drinks'}
        >
          Wine & Drinks
        </button>
      </div>

      <div className="bookStage">
        <section className="bookScene" aria-label="Trumps menu book">
          <button
            className="pageArrow pageArrowPrev"
            onClick={goPrev}
            disabled={isMoving}
            aria-label="Previous page"
          >
            <ChevronLeft size={22} />
          </button>

          <div className={bookClasses} id="book">
            {/* Left page */}
            <button
              className={`spreadPage leftPage ${isOpen && focusSide === 'left' ? 'activePage' : ''}`}
              onClick={() => isOpen ? setFocusSide('left') : openBook()}
              aria-label={`${currentSpread?.leftChapter.title} — Focus left page`}
            >
              <div className="pageContent">
                {currentSpread && (
                  <BookPage
                    title={currentSpread.leftChapter.title}
                    items={currentSpread.leftItems}
                    onItemClick={onItemClick}
                    onAddToCart={onAddToCart}
                    onPairingClick={onPairingClick}
                  />
                )}
              </div>
            </button>

            {/* Right page */}
            <button
              className={`spreadPage rightPage ${isOpen && focusSide === 'right' ? 'activePage' : ''}`}
              onClick={() => isOpen ? setFocusSide('right') : openBook()}
              aria-label={currentSpread?.rightChapter ? `${currentSpread.rightChapter.title} — Focus right page` : 'Blank page'}
            >
              <div className="pageContent">
                {currentSpread?.rightChapter && (
                  <BookPage
                    title={currentSpread.rightChapter.title}
                    items={currentSpread.rightItems}
                    onItemClick={onItemClick}
                    onAddToCart={onAddToCart}
                    onPairingClick={onPairingClick}
                  />
                )}
              </div>
            </button>

            {/* Turn sheet */}
            <div className={turnSheetClasses} aria-hidden="true">
              <div className="turnFace">
                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(160deg, #001520, #021524)' }} />
              </div>
              <div className="turnFace turnFaceBack">
                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(160deg, #001520, #021524)' }} />
              </div>
            </div>

            {/* Front cover */}
            <button
              className="frontCover"
              onClick={openBook}
              aria-label={isOpen ? 'Menu book is open' : 'Open menu book'}
            >
              <span className="coverFace">
                <div className={styles.coverFront}>
                  <div className={styles.coverTitle}>TRUMPS</div>
                  <div className={styles.coverSub}>PRIME GRILLHOUSE</div>
                  <div className={styles.coverLine} />
                  <div className={styles.coverInstruction}>Tap to open</div>
                </div>
              </span>
              <span className="coverFace coverBack" aria-hidden="true">
                <span style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(34px,6vw,70px)', fontWeight: 900, letterSpacing: '0.08em', color: 'rgba(247,251,255,0.9)' }}>TRUMPS</span>
              </span>
            </button>
          </div>

          <button
            className="pageArrow pageArrowNext"
            onClick={goNext}
            disabled={isMoving}
            aria-label="Next page"
          >
            <ChevronRight size={22} />
          </button>
        </section>
      </div>

      {isOpen && (
        <div className={styles.pageReadout} aria-live="polite">
          {String(currentPage).padStart(2, '0')} / {String(pageCount).padStart(2, '0')}
        </div>
      )}
    </div>
  );
}
