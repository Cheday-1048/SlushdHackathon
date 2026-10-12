import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';
import { App } from '../App';
import { capabilities, presentation } from '../content/guide';
import { GuidePage } from './guide';

beforeAll(() => {
  // jsdom has neither IntersectionObserver (scroll reveals) nor matchMedia (theme provider, media-query hooks).
  class FakeObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  window.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;
  window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false })) as typeof window.matchMedia;
});

const renderGuide = (entry = '/guide') => render(<MemoryRouter initialEntries={[entry]}><GuidePage /></MemoryRouter>);

describe('Guide page', () => {
  it('shows the section index and every required section', () => {
    renderGuide();
    const nav = screen.getByRole('navigation', { name: 'Guide sections' });
    for (const label of ['Product overview', 'How it works', 'Core features', 'Business scenario', 'System architecture', 'MVP vs final product']) expect(within(nav).getByRole('button', { name: label })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /turns business data into business decisions/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The current build is a hackathon MVP' })).toBeInTheDocument();
  });

  it('states that the build is an MVP and labels the scenario figures honestly', () => {
    renderGuide();
    expect(screen.getAllByText(/hackathon MVP and proof of concept/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Step 3 shows a planned capability/)).toBeInTheDocument();
    expect(screen.getByText(/hypothetical results under stated assumptions, not forecasts/)).toBeInTheDocument();
  });

  it('separates available and planned modules and explains each one', () => {
    renderGuide();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    for (const title of ['Dashboard', 'Business Analytics', 'Simulation Lab', 'A/B Arena', 'Goal Optimizer', 'AI Decision Assistant']) expect(headings).toContain(title);
    fireEvent.click(screen.getByRole('button', { name: /Show details for Simulation Lab/ }));
    const details = screen.getByRole('region', { name: 'Simulation Lab details' });
    expect(details).toHaveTextContent('Implemented today');
    expect(details).toHaveTextContent('Seven assumptions');
    expect(details).toHaveTextContent('not available in Demo Mode');
    fireEvent.click(screen.getByRole('button', { name: /Show details for AI Decision Assistant/ }));
    expect(screen.getByRole('region', { name: 'AI Decision Assistant details' })).toHaveTextContent('no live OpenAI request has been made');
  });

  it('lets the reader step through the workflow and shows what works today', async () => {
    renderGuide();
    fireEvent.click(screen.getByRole('button', { name: 'Next stage' }));
    expect(await screen.findByRole('heading', { name: 'Data Processing', level: 3 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /AI Analysis/ }));
    expect(await screen.findByText(/no live OpenAI request has been made/)).toBeInTheDocument();
  });

  it('filters the MVP versus final product comparison and shows the verification status', () => {
    renderGuide();
    const titles = () => within(screen.getByRole('list', { name: 'Capabilities' })).getAllByRole('heading', { level: 3 });
    expect(titles()).toHaveLength(capabilities.length);
    fireEvent.click(screen.getByRole('button', { name: 'Planned' }));
    expect(titles()).toHaveLength(capabilities.filter((item) => item.status === 'planned').length);
    expect(screen.getByText(/Not verified: a live OpenAI request, a live Supabase connection/)).toBeInTheDocument();
  });
});

describe('Presentation mode', () => {
  it('opens from the guide and moves forward and back through the requested order', async () => {
    renderGuide();
    fireEvent.click(screen.getByRole('button', { name: 'Presentation mode' }));
    expect(await screen.findByRole('heading', { level: 2, name: presentation[0].title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(await screen.findByRole('heading', { level: 2, name: presentation[1].title })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(await screen.findByRole('heading', { level: 2, name: presentation[2].title })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(await screen.findByRole('heading', { level: 2, name: presentation[1].title })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Presentation progress' })).toHaveAttribute('aria-valuenow', '2');
  });

  it('keeps technical details optional', async () => {
    renderGuide('/guide?view=presentation&step=1');
    expect(screen.queryByRole('region', { name: 'Technical details' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Technical details/ }));
    expect(await screen.findByRole('region', { name: 'Technical details' })).toHaveTextContent('What the MVP contains');
  });

  it('opens a deep-linked step, clamps invalid steps and exits to the guide', async () => {
    const view = renderGuide(`/guide?view=presentation&step=${presentation.length}`);
    expect(await screen.findByRole('heading', { level: 2, name: presentation[presentation.length - 1].title })).toBeInTheDocument();
    view.unmount();
    renderGuide('/guide?view=presentation&step=99');
    expect(await screen.findByRole('heading', { level: 2, name: presentation[presentation.length - 1].title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exit presentation' }));
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Guide sections' })).toBeInTheDocument());
  });
});

describe('Guide navigation', () => {
  it('adds a Guide item to the sidebar that opens the page', () => {
    render(<MemoryRouter initialEntries={['/guide']}><App /></MemoryRouter>);
    const link = screen.getByRole('link', { name: 'Guide' });
    expect(link).toHaveAttribute('href', '/guide');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1, name: 'Guide' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Simulation Lab' })).toHaveAttribute('href', '/simulation-lab');
    expect(screen.getByRole('link', { name: 'AI Assistant' })).toHaveAttribute('href', '/ai-assistant');
    expect(screen.getByRole('button', { name: 'A/B Testing Planned' })).toBeDisabled();
  });
});
