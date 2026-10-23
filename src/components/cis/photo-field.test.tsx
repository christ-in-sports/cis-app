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

describe('PhotoPicker', () => {
  it('prepares the file, uploads it and hands back the path and a local preview', async () => {
    const onUploaded = jest.fn();
    const { container } = render(<PhotoPicker label="Add a photo" onUploaded={onUploaded} />);

    choose(container);

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith({ path: PATH, previewUrl: 'blob:preview' }));
    expect(preparePhoto).toHaveBeenCalledWith(expect.objectContaining({ name: 'IMG_1.jpg' }));
    expect(uploadKidPhoto).toHaveBeenCalledWith(prepared);
  });

  it('accepts iPhone HEIC files, which some browsers do not count as images', () => {
    const { container } = render(<PhotoPicker label="Add a photo" onUploaded={jest.fn()} />);

    expect(fileInput(container).accept).toBe('image/*,.heic,.heif');
  });

  it('opens the file chooser from the button', () => {
    const { container } = render(<PhotoPicker label="Add a photo" onUploaded={jest.fn()} />);
    const click = jest.spyOn(fileInput(container), 'click');

    fireEvent.click(screen.getByRole('button', { name: 'Add a photo' }));

    expect(click).toHaveBeenCalled();
  });

  it('says what it is doing, and cannot be pressed again meanwhile', async () => {
    let finishPrepare!: (p: unknown) => void;
    let finishUpload!: (path: string) => void;
    let finishSave!: () => void;
    jest.mocked(preparePhoto).mockReturnValue(new Promise((r) => { finishPrepare = r; }) as never);
    jest.mocked(uploadKidPhoto).mockReturnValue(new Promise((r) => { finishUpload = r; }));
    const { container } = render(
      <PhotoPicker label="Add a photo" onUploaded={() => new Promise<void>((r) => { finishSave = r; })} />
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
    const { container } = render(<PhotoPicker label="Add a photo" onUploaded={onUploaded} />);

    choose(container, 'IMG_1.HEIC');

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a JPEG instead');
    expect(onUploaded).not.toHaveBeenCalled();
    expect(uploadKidPhoto).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add a photo' })).toBeEnabled();
  });

  it('hides an unexpected error behind a plain message', async () => {
    jest.mocked(uploadKidPhoto).mockRejectedValue(new Error('storage/internal secret detail'));
    const { container } = render(<PhotoPicker label="Add a photo" onUploaded={jest.fn()} />);

    choose(container);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('could not be added');
    expect(alert).not.toHaveTextContent('secret');
  });

  it('shows an error from saving the photo, and recovers', async () => {
    const { container } = render(
      <PhotoPicker label="Replace photo" onUploaded={jest.fn().mockRejectedValue(new Error('x'))} />
    );

    choose(container);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace photo' })).toBeEnabled();
  });

  it('clears an earlier error when another photo is chosen', async () => {
    jest.mocked(preparePhoto).mockRejectedValueOnce(new PhotoError('unreadable', 'That file could not be read.'));
    const { container } = render(<PhotoPicker label="Add a photo" onUploaded={jest.fn()} />);

    choose(container);
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    choose(container);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('forgets the chosen file so the same one can be chosen again', async () => {
    const { container } = render(<PhotoPicker label="Add a photo" onUploaded={jest.fn()} />);

    choose(container);

    await waitFor(() => expect(uploadKidPhoto).toHaveBeenCalled());
    expect(fileInput(container).value).toBe('');
  });

  it('does nothing when no file is chosen', () => {
    const { container } = render(<PhotoPicker label="Add a photo" onUploaded={jest.fn()} />);

    fireEvent.change(fileInput(container), { target: { files: [] } });

    expect(preparePhoto).not.toHaveBeenCalled();
  });

  it('can be switched off', () => {
    render(<PhotoPicker label="Add a photo" onUploaded={jest.fn()} disabled />);

    expect(screen.getByRole('button', { name: 'Add a photo' })).toBeDisabled();
  });
});

describe('PhotoField', () => {
  const base = { firstName: 'Mina', lastName: 'Hanna', value: null, onChange: jest.fn() };

  it('offers to add a photo when the kid has none, with their initials', () => {
    render(<PhotoField {...base} />);

    expect(screen.getByRole('button', { name: 'Add a photo' })).toBeInTheDocument();
    expect(screen.getByText('MH')).toBeInTheDocument();
  });

  it('offers to replace the photo the kid already has, and shows it', () => {
    const { container } = render(
      <PhotoField {...base} current={{ photoPath: 'a.webp', signedUrl: 'https://signed/a' }} />
    );

    expect(screen.getByRole('button', { name: 'Replace photo' })).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://signed/a');
  });

  it('shows what was just chosen instead of the photo on file', () => {
    const { container } = render(
      <PhotoField
        {...base}
        current={{ photoPath: 'a.webp', signedUrl: 'https://signed/a' }}
        value={{ path: PATH, previewUrl: 'blob:new' }}
      />
    );

    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:new');
  });

  it('labels the button, shows the form’s error, and ties them together', () => {
    render(<PhotoField {...base} error="Add a photo of your kid" hint="A clear photo of their face." />);

    // The group carries the heading and the button keeps its own name.
    const group = screen.getByRole('group', { name: 'Photo' });
    const button = screen.getByRole('button', { name: 'Add a photo' });
    expect(group).toContainElement(button);
    expect(screen.getByRole('alert')).toHaveTextContent('Add a photo of your kid');
    expect(button).toHaveAttribute('aria-invalid', 'true');
    const described = button.getAttribute('aria-describedby')!.split(' ');
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
