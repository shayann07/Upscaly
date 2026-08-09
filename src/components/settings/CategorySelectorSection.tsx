interface CategorySelectorSectionProps {
  activeCategory: string;
  big: boolean;
  pillStyle: (active: boolean, isBig: boolean) => React.CSSProperties;
  handleCategory: (cat: 'photo' | 'anime' | 'video') => void;
}

export function CategorySelectorSection({
  activeCategory,
  big,
  pillStyle,
  handleCategory,
}: CategorySelectorSectionProps) {
  return (
    <div className="flex gap-0.5 p-0.5 border border-[var(--border-default)] rounded-xl bg-[var(--bg-elevated)]">
      <button
        onClick={() => handleCategory('photo')}
        style={pillStyle(activeCategory === 'photo', big)}
        className="transition-all duration-200 hover:scale-[1.05] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
      >
        Photo
      </button>
      <button
        onClick={() => handleCategory('anime')}
        style={pillStyle(activeCategory === 'anime', big)}
        className="transition-all duration-200 hover:scale-[1.05] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
      >
        Anime
      </button>
      <button
        onClick={() => handleCategory('video')}
        style={pillStyle(activeCategory === 'video', big)}
        className="transition-all duration-200 hover:scale-[1.05] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
      >
        Video
      </button>
    </div>
  );
}
