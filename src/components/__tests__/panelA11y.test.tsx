import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AboutModal } from '../AboutModal';
import { RecentHistoryDrawer } from '../RecentHistoryDrawer';
import { ModelCatalogModal } from '../ModelCatalogModal';

/**
 * These three are non-modal side panels: they render beside a fully
 * interactive canvas with no backdrop. They must therefore expose
 * role="dialog" WITHOUT aria-modal (which would falsely tell assistive tech
 * the rest of the app is inert), carry an accessible name, and take focus
 * when opened. ConfirmCancelDialog is the genuinely modal case and is
 * asserted separately.
 */
describe('nav panel accessibility', () => {
  const panels = [
    {
      name: 'About',
      accessibleName: /shortcuts & info/i,
      closeLabel: /close shortcuts and info/i,
      render: () => render(<AboutModal onClose={vi.fn()} />),
    },
    {
      name: 'Recent history',
      accessibleName: /recent jobs/i,
      closeLabel: /close recent jobs/i,
      render: () => render(<RecentHistoryDrawer history={[]} onClose={vi.fn()} />),
    },
    {
      name: 'Model catalog',
      accessibleName: /model catalog/i,
      closeLabel: /close model catalog/i,
      render: () => render(<ModelCatalogModal onClose={vi.fn()} />),
    },
  ];

  it.each(panels)(
    '$name panel is a labelled, non-modal dialog',
    ({ accessibleName, render: renderPanel }) => {
      renderPanel();

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAccessibleName(accessibleName);
      // Non-modal: must NOT claim modality.
      expect(dialog).not.toHaveAttribute('aria-modal', 'true');
    }
  );

  it.each(panels)('$name panel takes focus when opened', ({ render: renderPanel }) => {
    renderPanel();
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it.each(panels)(
    '$name close control has an accessible name',
    ({ closeLabel, render: renderPanel }) => {
      renderPanel();
      expect(screen.getByRole('button', { name: closeLabel })).toBeInTheDocument();
    }
  );
});
