import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProviderManager } from '../ProviderManager';
import * as api from '../../services/api';

// Mock the serverStore
vi.mock('../../stores/serverStore', () => ({
  useServerStore: vi.fn(() => ({
    connectionStatus: 'connected',
  })),
}));

// Mock the api module
vi.mock('../../services/api', () => ({
  getProviders: vi.fn(),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  deleteProvider: vi.fn(),
  setDefaultProvider: vi.fn(),
}));

import { useServerStore } from '../../stores/serverStore';

describe('ProviderManager', () => {
  const mockOnClose = vi.fn();

  const mockProviders = [
    {
      id: 'p1',
      name: 'Claude Default',
      type: 'claude' as const,
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'p2',
      name: 'Work Claude',
      type: 'claude' as const,
      cliPath: '/usr/local/bin/claude',
      isDefault: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getProviders).mockResolvedValue(mockProviders);
    vi.mocked(api.createProvider).mockResolvedValue(mockProviders[0]);
    vi.mocked(api.updateProvider).mockResolvedValue(undefined);
    vi.mocked(api.deleteProvider).mockResolvedValue(undefined);
    vi.mocked(api.setDefaultProvider).mockResolvedValue(undefined);
    vi.mocked(useServerStore).mockReturnValue({ connectionStatus: 'connected' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when not open', () => {
    const { container } = render(
      <ProviderManager isOpen={false} onClose={mockOnClose} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal when open', async () => {
    render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText('Provider Management')).toBeInTheDocument();
  });

  it('shows "Connect to a server first" when disconnected', () => {
    vi.mocked(useServerStore).mockReturnValue({ connectionStatus: 'disconnected' });

    render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText('Connect to a server first')).toBeInTheDocument();
  });

  it('loads and displays providers on open', async () => {
    render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(api.getProviders).toHaveBeenCalled();
    });

    expect(screen.getByText('Claude Default')).toBeInTheDocument();
    expect(screen.getByText('Work Claude')).toBeInTheDocument();
  });

  it('shows Default badge for default provider', async () => {
    render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('Claude Default')).toBeInTheDocument();
    });

    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('shows provider type badge', async () => {
    render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('Claude Default')).toBeInTheDocument();
    });

    const claudeBadges = screen.getAllByText('claude');
    expect(claudeBadges.length).toBeGreaterThan(0);
  });

  it('shows cliPath for provider that has one', async () => {
    render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('/usr/local/bin/claude')).toBeInTheDocument();
    });
  });

  it('shows empty state when no providers', async () => {
    vi.mocked(api.getProviders).mockResolvedValue([]);

    render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText(/No providers configured/)).toBeInTheDocument();
    });
  });

  it('closes modal when backdrop is clicked', () => {
    render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

    // The backdrop is the first div with bg-black/50
    const backdrop = document.querySelector('.bg-black\\/50');
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop!);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes modal when close button is clicked', async () => {
    render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('Provider Management')).toBeInTheDocument();
    });

    // Find close button by finding the header and its button
    const header = screen.getByText('Provider Management').closest('div')?.parentElement;
    const closeBtn = header?.querySelector('button');
    expect(closeBtn).toBeTruthy();
    if (closeBtn) {
      fireEvent.click(closeBtn);
      expect(mockOnClose).toHaveBeenCalled();
    }
  });

  describe('Add Provider Form', () => {
    it('shows add form when Add Provider button is clicked', async () => {
      render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Claude Default')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Provider'));

      // Check for form elements by their text content since labels don't have htmlFor
      expect(screen.getByText(/Name \*/)).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Personal Claude/)).toBeInTheDocument();
    });

    it('creates provider on form submit', async () => {
      render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Claude Default')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Provider'));

      const nameInput = screen.getByPlaceholderText(/Personal Claude/);
      fireEvent.change(nameInput, { target: { value: 'New Provider' } });

      fireEvent.click(screen.getByText('Create'));

      await waitFor(() => {
        expect(api.createProvider).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'New Provider',
            type: 'claude',
          })
        );
      });
    });

    it('does not submit when name is empty', async () => {
      render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Claude Default')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Provider'));

      // Create button should be disabled when name is empty
      const createButton = screen.getByText('Create');
      expect(createButton).toBeDisabled();
    });

    it('goes back to list when Cancel is clicked', async () => {
      render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Claude Default')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Provider'));
      expect(screen.getByText('Create')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Cancel'));

      expect(screen.queryByText('Create')).not.toBeInTheDocument();
      expect(screen.getByText('Add Provider')).toBeInTheDocument();
    });
  });

  describe('Edit Provider', () => {
    it('populates form when Edit is clicked', async () => {
      render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Work Claude')).toBeInTheDocument();
      });

      // Click the edit button for Work Claude
      const editButtons = screen.getAllByTitle('Edit');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByDisplayValue('Claude Default')).toBeInTheDocument();
      });
    });

    it('calls updateProvider on edit submit', async () => {
      render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Claude Default')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByTitle('Edit');
      fireEvent.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Update')).toBeInTheDocument();
      });

      const nameInput = screen.getByDisplayValue('Claude Default');
      fireEvent.change(nameInput, { target: { value: 'Updated Name' } });

      fireEvent.click(screen.getByText('Update'));

      await waitFor(() => {
        expect(api.updateProvider).toHaveBeenCalledWith(
          'p1',
          expect.objectContaining({
            name: 'Updated Name',
          })
        );
      });
    });
  });

  describe('Delete Provider', () => {
    it('calls deleteProvider when delete is confirmed', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Claude Default')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByTitle('Delete');
      fireEvent.click(deleteButtons[0]);

      expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this provider?');
      expect(api.deleteProvider).toHaveBeenCalledWith('p1');

      confirmSpy.mockRestore();
    });

    it('does not delete when confirm is cancelled', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Claude Default')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByTitle('Delete');
      fireEvent.click(deleteButtons[0]);

      expect(confirmSpy).toHaveBeenCalled();
      expect(api.deleteProvider).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });
  });

  describe('Set Default Provider', () => {
    it('calls setDefaultProvider when set default is clicked', async () => {
      render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Work Claude')).toBeInTheDocument();
      });

      // Set default button only appears for non-default providers
      const setDefaultButtons = screen.getAllByTitle('Set as default');
      fireEvent.click(setDefaultButtons[0]);

      expect(api.setDefaultProvider).toHaveBeenCalledWith('p2');
    });

    it('does not show set default button for already default provider', async () => {
      vi.mocked(api.getProviders).mockResolvedValue([
        {
          id: 'p1',
          name: 'Only Provider',
          type: 'claude',
          isDefault: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Only Provider')).toBeInTheDocument();
      });

      expect(screen.queryByTitle('Set as default')).not.toBeInTheDocument();
    });
  });

  describe('Form validation', () => {
    it('shows alert for invalid JSON in env field', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Claude Default')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Provider'));

      const nameInput = screen.getByPlaceholderText(/Personal Claude/);
      fireEvent.change(nameInput, { target: { value: 'New Provider' } });

      const envTextarea = screen.getByPlaceholderText(/ANTHROPIC_API_KEY/);
      fireEvent.change(envTextarea, { target: { value: 'invalid json' } });

      fireEvent.click(screen.getByText('Create'));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith('Invalid JSON in environment variables');
      });

      expect(api.createProvider).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });

    it('accepts valid JSON in env field', async () => {
      render(<ProviderManager isOpen={true} onClose={mockOnClose} />);

      await waitFor(() => {
        expect(screen.getByText('Claude Default')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Add Provider'));

      const nameInput = screen.getByPlaceholderText(/Personal Claude/);
      fireEvent.change(nameInput, { target: { value: 'New Provider' } });

      const envTextarea = screen.getByPlaceholderText(/ANTHROPIC_API_KEY/);
      fireEvent.change(envTextarea, { target: { value: '{"API_KEY": "test"}' } });

      fireEvent.click(screen.getByText('Create'));

      await waitFor(() => {
        expect(api.createProvider).toHaveBeenCalledWith(
          expect.objectContaining({
            env: { API_KEY: 'test' },
          })
        );
      });
    });
  });
});
