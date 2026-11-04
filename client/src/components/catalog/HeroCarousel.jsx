import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getActiveProducts,
  getCatalogProductImage,
  getProductBasis,
  getProductBuildCode,
  getProductBuildName,
} from '../../lib/products';
import Icon from '../ui/Icon';
import Link from '../ui/Link';
import './HeroCarousel.css';

const FALLBACK_IMAGE = '/images/home/ruka-hero.jpg';
const AUTOPLAY_MS = 6000;
const DRAG_THRESHOLD = 50;

function toSlide(product, index) {
  return {
    id: product.id,
    name: product.name || getProductBuildName(product) || 'Custom build',
    buildCode: getProductBuildCode(product) || `BUILD ${String(index + 1).padStart(2, '0')}`,
    buildName: getProductBuildName(product),
    basis: getProductBasis(product),
    category: product.categoryName || 'Custom build',
    image: getCatalogProductImage(product, index),
    detailPath: `/motor/${encodeURIComponent(product.id)}`,
  };
}

export default function HeroCarousel({ products, isLoading, error }) {
  const slides = useMemo(() => (
    getActiveProducts(products)
      .map(toSlide)
      .filter((slide) => slide.image)
  ), [products]);

  const [index, setIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [failedImages, setFailedImages] = useState({});
  const drag = useRef(null);
  const count = slides.length;
  const activeIndex = count ? ((index % count) + count) % count : 0;

  const goTo = useCallback((nextIndex) => {
    if (!count) return;
    setIndex(((nextIndex % count) + count) % count);
  }, [count]);

  useEffect(() => {
    if (count <= 1 || isPaused || isDragging) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, AUTOPLAY_MS);

    return () => window.clearInterval(timer);
  }, [count, isPaused, isDragging]);

  const beginDrag = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('a, button, input, select, textarea')) return;

    drag.current = {
      dx: 0,
      id: event.pointerId,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
    };
    setIsDragging(true);
    setDragOffset(0);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event) => {
    if (!drag.current || event.pointerId !== drag.current.id) return;

    const dx = event.clientX - drag.current.startX;
    const dy = event.clientY - drag.current.startY;

    if (!drag.current.moved) {
      if (Math.abs(dx) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        setIsDragging(false);
        setDragOffset(0);
        return;
      }
      drag.current.moved = true;
    }

    if (event.cancelable) event.preventDefault();
    drag.current.dx = dx;
    setDragOffset(dx);
  };

  const endDrag = (event) => {
    if (!drag.current || event.pointerId !== drag.current.id) return;

    const { dx, moved } = drag.current;
    drag.current = null;
    setIsDragging(false);
    setDragOffset(0);

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!moved) return;
    if (dx <= -DRAG_THRESHOLD) goTo(activeIndex + 1);
    else if (dx >= DRAG_THRESHOLD) goTo(activeIndex - 1);
  };

  if (!count) {
    return (
      <>
        <img
          alt=""
          aria-hidden="true"
          className="rm-home__hero-image"
          fetchPriority="high"
          src={FALLBACK_IMAGE}
        />
        <p className="rm-home__hero-caption">
          {isLoading
            ? 'Loading catalog'
            : error || 'Catalog is being updated'}
        </p>
      </>
    );
  }

  const current = slides[activeIndex];
  const captionName = current.buildName || current.name;

  return (
    <>
      <div
        aria-label="Featured motorcycle builds"
        aria-roledescription="carousel"
        className="rm-hero-carousel"
        onDragStart={(event) => event.preventDefault()}
        onPointerCancel={endDrag}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
      >
        <div
          className={`rm-hero-carousel__track${isDragging ? ' is-dragging' : ''}`}
          style={{ transform: `translate3d(calc(-${activeIndex * 100}% + ${dragOffset}px), 0, 0)` }}
        >
          {slides.map((slide, slideIndex) => {
            const isActive = slideIndex === activeIndex;
            const imageFailed = failedImages[slide.id];

            return (
              <div
                aria-hidden={isActive ? undefined : 'true'}
                aria-label={`${slideIndex + 1} of ${count}`}
                aria-roledescription="slide"
                className="rm-hero-carousel__slide"
                key={slide.id}
                role="group"
              >
                {imageFailed ? (
                  <img
                    alt=""
                    aria-hidden="true"
                    className="rm-hero-carousel__image"
                    draggable="false"
                    src={FALLBACK_IMAGE}
                  />
                ) : (
                  <img
                    alt=""
                    aria-hidden="true"
                    className="rm-hero-carousel__image"
                    draggable="false"
                    fetchPriority={slideIndex === 0 ? 'high' : 'auto'}
                    loading={slideIndex === 0 ? 'eager' : 'lazy'}
                    onError={() => setFailedImages((failed) => ({ ...failed, [slide.id]: true }))}
                    src={slide.image}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div aria-hidden="true" className="rm-home__hero-shade" />

      {count > 1 ? (
        <div className="rm-hero-carousel__controls">
          <button
            aria-label="Previous motorcycle"
            className="rm-hero-carousel__arrow"
            onClick={() => goTo(activeIndex - 1)}
            type="button"
          >
            <Icon name="arrow-left" size={18} />
          </button>

          <div aria-label="Choose a motorcycle" className="rm-hero-carousel__dots" role="tablist">
            {slides.map((slide, slideIndex) => (
              <button
                aria-label={`Show ${slide.name}`}
                aria-selected={slideIndex === activeIndex}
                className={`rm-hero-carousel__dot${slideIndex === activeIndex ? ' is-active' : ''}`}
                key={slide.id}
                onClick={() => goTo(slideIndex)}
                role="tab"
                tabIndex={slideIndex === activeIndex ? 0 : -1}
                type="button"
              >
                <span aria-hidden="true" />
              </button>
            ))}
          </div>

          <button
            aria-label="Next motorcycle"
            className="rm-hero-carousel__arrow"
            onClick={() => goTo(activeIndex + 1)}
            type="button"
          >
            <Icon name="arrow-right" size={18} />
          </button>

          <button
            aria-label={isPaused ? 'Start automatic slideshow' : 'Pause automatic slideshow'}
            aria-pressed={isPaused}
            className="rm-hero-carousel__toggle"
            onClick={() => setIsPaused((paused) => !paused)}
            type="button"
          >
            <Icon name={isPaused ? 'play' : 'pause'} size={14} />
          </button>
        </div>
      ) : null}

      <p className="rm-home__hero-caption">
        <Link to={current.detailPath}>
          {current.name}
          {captionName && captionName !== current.name ? ` / ${captionName}` : ''}
        </Link>
        <span>
          {current.buildCode} · {current.category}
          {current.basis ? ` · ${current.basis}` : ''}
        </span>
      </p>
    </>
  );
}
