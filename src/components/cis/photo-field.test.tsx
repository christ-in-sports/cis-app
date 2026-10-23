import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { PhotoError, preparePhoto } from '@/lib/photo/prepare';
import { uploadKidPhoto } from '@/lib/photo/upload';

import { PhotoField, PhotoPicker } from './photo-field';

jest.mock('@/lib/photo/prepare', () => {
  const actual = jest.requireActual('@/lib/photo/prepare');
  return { ...actual, preparePhoto: jest.fn() };
});
jest.mock('@/lib/photo/upload', () => ({ uploadKidPhoto: jest.fn() }));

const PATH = '4f3c1d52-9c7e-4d52-8a35-0b1f2f6c7a11.webp';
const prepared = { blob: new Blob(['x'], { type: 'image/webp' }), contentType: 'image/webp', extension: 'webp', width: 512, height: 512 };

const fileInput = (container: HTMLElement) => container.querySelector('input[type="file"]') as HTMLInputElement;
const choose = (container: HTMLElement, name = 'IMG_1.jpg') =>
  fireEvent.change(fileInput(container), { target: { files: [new File(['x'], name, { type: 'image/jpeg' })] } });

beforeEach(() => {
  jest.clearAllMocks();
  URL.createObjectURL = jest.fn(() => 'blob:preview');
  URL.revokeObjectURL = jest.fn();
  jest.mocked(preparePhoto).mockResolvedValue(prepared as never);
  jest.mocked(uploadKidPhoto).mockResolvedValue(PATH);
});

const ON_FILE = { photoPath: 'a.webp', signedUrl: 'https://signed/a' };

describe('PhotoPicker', () => {
  const picker = (over: Partial<React.ComponentProps<typeof PhotoPicker>> = {}) => (
    <PhotoPicker firstName="Mina" lastName="Hanna" photo={null} onUploaded={jest.fn()} {...over} />
  );

  it('prepares the file, uploads it and hands back the path and a local preview', async () => {
    const onUploaded = jest.fn();
    const { container } = render(picker({ onUploaded }));

    choose(container);

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith({ path: PATH, previewUrl: 'blob:preview' }));
    expect(preparePhoto).toHaveBeenCalledWith(expect.objectContaining({ name: 'IMG_1.jpg' }));
    expect(uploadKidPhoto).toHaveBeenCalledWith(prepared);
  });

  it('accepts iPhone HEIC files, which some browsers do not count as images', () => {
    const { container } = render(picker());

    expect(fileInput(container).accept).toBe('image/*,.heic,.heif');
  });

  describe('with no photo', () => {
    it('is one square that says what it is for, with a camera, not initials', () => {
      const { container } = render(picker());

      const tile = screen.getByRole('button', { name: 'Add a photo' });
      expect(tile.querySelector('svg')).not.toBeNull();
      expect(screen.queryByText('MH')).not.toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(1);
      // A square, 112px, with the chip radius: never a circle or a pill.
      expect(tile.className).toMatch(/\bh-28\b/);
      expect(tile.className).toMatch(/\bw-28\b/);
      expect(tile.className).toContain('rounded-cis-chip');
      expect(tile.className).not.toMatch(/rounded-full|rounded-cis-pill/);
      expect(container.querySelector('img')).toBeNull();
    });

    it('opens the file chooser when the square is tapped', () => {
      const { container } = render(picker());
      const click = jest.spyOn(fileInput(container), 'click');

      fireEvent.click(screen.getByRole('button', { name: 'Add a photo' }));

      expect(click).toHaveBeenCalled();
    });

    it('takes the danger outline and the field’s hint and error when the form is refused', () => {
      render(picker({ invalid: true, describedBy: 'hint error' }));

      const tile = screen.getByRole('button', { name: 'Add a photo' });
      // A button does not support aria-invalid, so the state is a data attribute.
      expect(tile).not.toHaveAttribute('aria-invalid');
      expect(tile).toHaveAttribute('data-invalid', 'true');
      expect(tile).toHaveAttribute('aria-describedby', 'hint error');
      expect(tile.className).toContain('data-[invalid=true]:border-cis-danger');
    });

    it('can be switched off', () => {
      render(picker({ disabled: true }));

      expect(screen.getByRole('button', { name: 'Add a photo' })).toBeDisabled();
    });
  });

  describe('with a photo', () => {
    it('shows the photo, with a Replace photo button under it', () => {
      const { container } = render(picker({ photo: ON_FILE }));

      expect(container.querySelector('img')).toHaveAttribute('src', 'https://signed/a');
      expect(screen.getByRole('button', { name: 'Replace photo' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add a photo' })).not.toBeInTheDocument();
    });

    it('has one control for the keyboard and screen readers, not two that say the same thing', () => {
      const { container } = render(picker({ photo: ON_FILE }));

      // Both buttons exist for a finger or a mouse; only "Replace photo" is exposed.
      expect(container.querySelectorAll('button')).toHaveLength(2);
      expect(screen.getAllByRole('button')).toHaveLength(1);
      const photoTile = container.querySelector('button[aria-hidden="true"]') as HTMLButtonElement;
      expect(photoTile).toHaveAttribute('tabindex', '-1');
    });

    it('opens the file chooser from either the photo or the button', () => {
      const { container } = render(picker({ photo: ON_FILE }));
      const click = jest.spyOn(fileInput(container), 'click');

      fireEvent.click(container.querySelector('button[aria-hidden="true"]')!);
      fireEvent.click(screen.getByRole('button', { name: 'Replace photo' }));

      expect(click).toHaveBeenCalledTimes(2);
    });

    it('shows the initials if the photo has no link, because signing failed', () => {
      const { container } = render(picker({ photo: { photoPath: 'a.webp', signedUrl: null } }));

      expect(container.querySelector('img')).toBeNull();
      expect(screen.getByText('MH')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Replace photo' })).toBeInTheDocument();
    });

    it('can be switched off', () => {
      const { container } = render(picker({ photo: ON_FILE, disabled: true }));

      expect(screen.getByRole('button', { name: 'Replace photo' })).toBeDisabled();
      expect(container.querySelector('button[aria-hidden="true"]')).toBeDisabled();
    });
  });

  it('says what it is doing, and cannot be pressed again meanwhile', async () => {
    let finishPrepare!: (p: unknown) => void;
    let finishUpload!: (path: string) => void;
    let finishSave!: () => void;
    jest.mocked(preparePhoto).mockReturnValue(new Promise((r) => { finishPrepare = r; }) as never);
    jest.mocked(uploadKidPhoto).mockReturnValue(new Promise((r) => { finishUpload = r; }));
    const { container } = render(
      picker({ onUploaded: () => new Promise<void>((r) => { finishSave = r; }) })
    );

    choose(container);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Preparing photo…'));
    expect(screen.getByRole('button', { name: 'Add a photo' })).toBeDisabled();

    await act(async () => finishPrepare(prepared));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Uploading photo…'));

    await act(async () => finishUpload(PATH));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saving photo…'));

    await act(async () => finishSave());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(''));
    expect(screen.getByRole('button', { name: 'Add a photo' })).toBeEnabled();
  });

  it('shows the message of a photo error, which is written for the parent', async () => {
    jest.mocked(preparePhoto).mockRejectedValue(new PhotoError('heic-failed', 'That photo could not be converted. Choose a JPEG instead.'));
    const onUploaded = jest.fn();
    const { container } = render(picker({ onUploaded }));

    choose(container, 'IMG_1.HEIC');

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a JPEG instead');
    expect(onUploaded).not.toHaveBeenCalled();
    expect(uploadKidPhoto).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add a photo' })).toBeEnabled();
  });

  it('hides an unexpected error behind a plain message', async () => {
    jest.mocked(uploadKidPhoto).mockRejectedValue(new Error('storage/internal secret detail'));
    const { container } = render(picker());

    choose(container);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('could not be added');
    expect(alert).not.toHaveTextContent('secret');
  });

  it('shows an error from saving the photo, and recovers', async () => {
    const { container } = render(
      picker({ photo: ON_FILE, onUploaded: jest.fn().mockRejectedValue(new Error('x')) })
    );

    choose(container);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace photo' })).toBeEnabled();
  });

  it('clears an earlier error when another photo is chosen', async () => {
    jest.mocked(preparePhoto).mockRejectedValueOnce(new PhotoError('unreadable', 'That file could not be read.'));
    const { container } = render(picker());

    choose(container);
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    choose(container);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('forgets the chosen file so the same one can be chosen again', async () => {
    const { container } = render(picker());

    choose(container);

    await waitFor(() => expect(uploadKidPhoto).toHaveBeenCalled());
    expect(fileInput(container).value).toBe('');
  });

  it('does nothing when no file is chosen', () => {
    const { container } = render(picker());

    fireEvent.change(fileInput(container), { target: { files: [] } });

    expect(preparePhoto).not.toHaveBeenCalled();
  });
});

describe('PhotoField', () => {
  const base = { firstName: 'Mina', lastName: 'Hanna', value: null, onChange: jest.fn() };

  it('offers to add a photo when the kid has none', () => {
    render(<PhotoField {...base} />);

    expect(screen.getByRole('button', { name: 'Add a photo' })).toBeInTheDocument();
  });

  it('shows the photo the kid already has, with a way to replace it', () => {
    const { container } = render(<PhotoField {...base} current={ON_FILE} />);

    expect(screen.getByRole('button', { name: 'Replace photo' })).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://signed/a');
  });

  it('shows what was just chosen instead of the photo on file', () => {
    const { container } = render(
      <PhotoField {...base} current={ON_FILE} value={{ path: PATH, previewUrl: 'blob:new' }} />
    );

    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:new');
  });

  it('labels the group, shows the form’s error, and ties them to the control', () => {
    render(<PhotoField {...base} error="Add a photo of your kid" hint="A clear photo of their face." />);

    // The group carries the heading and the control keeps its own name.
    const group = screen.getByRole('group', { name: 'Photo' });
    const tile = screen.getByRole('button', { name: 'Add a photo' });
    expect(group).toContainElement(tile);
    expect(screen.getByRole('alert')).toHaveTextContent('Add a photo of your kid');
    expect(tile).toHaveAttribute('data-invalid', 'true');
    const described = tile.getAttribute('aria-describedby')!.split(' ');
    expect(described).toContain(screen.getByRole('alert').id);
    expect(described).toContain(screen.getByText('A clear photo of their face.').id);
  });

  it('passes the uploaded photo up', async () => {
    const onChange = jest.fn();
    const { container } = render(<PhotoField {...base} onChange={onChange} />);

    choose(container);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ path: PATH, previewUrl: 'blob:preview' }));
  });

  it('releases the preview link when the photo changes or the form closes', () => {
    const { rerender, unmount } = render(<PhotoField {...base} value={{ path: PATH, previewUrl: 'blob:one' }} />);

    rerender(<PhotoField {...base} value={{ path: PATH, previewUrl: 'blob:two' }} />);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:one');

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:two');
  });
});
