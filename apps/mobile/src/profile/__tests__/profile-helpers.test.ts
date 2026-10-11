import { ApiError } from '../../api/errors';
import { formatBirthday } from '../components';
import { fieldErrors, toUpdate } from '../form';

jest.mock('expo-secure-store', () => require('../../testing/fakes').secureStoreMock);

describe('toUpdate', () => {
  it('splits comma lists, trims and drops empty items', () => {
    expect(toUpdate('music', { genres: ' house,  french touch ,,', artists: '' })).toEqual({
      musicPrefs: { genres: ['house', 'french touch'], artists: [] },
    });
  });

  it('trims text fields and sends empty strings so the server clears them', () => {
    expect(toUpdate('public', { displayName: ' Yasmine ', bio: '  ', city: 'Paris ' })).toEqual({
      displayName: 'Yasmine',
      public: { bio: '', city: 'Paris' },
    });
    expect(toUpdate('friends', { phone: ' +33 6 ', birthday: '1999-04-23' })).toEqual({
      friends: { phone: '+33 6', birthday: '1999-04-23' },
    });
    expect(toUpdate('private', { fullName: 'Yasmine B', address: '' })).toEqual({
      private: { fullName: 'Yasmine B', address: '' },
    });
  });
});

describe('fieldErrors', () => {
  it('maps server field paths to the form keys (last segment), first message only', () => {
    const error = new ApiError(400, 'VALIDATION_FAILED', 'Invalid', {
      fields: {
        'musicPrefs.genres': ['Too many genres.', 'Second message'],
        'public.bio': ['Too long.'],
        displayName: ['Enter a display name.'],
      },
    });
    expect(fieldErrors(error)).toEqual({
      genres: 'Too many genres.',
      bio: 'Too long.',
      displayName: 'Enter a display name.',
    });
  });

  it('returns nothing when the error has no field details', () => {
    expect(fieldErrors(new ApiError(400, 'VALIDATION_FAILED', 'Invalid'))).toEqual({});
  });
});

describe('formatBirthday', () => {
  it('shows the stored calendar day, whatever the device timezone', () => {
    const text = formatBirthday('1999-04-23');
    expect(text).toContain('23');
    expect(text).toContain('1999');
    expect(text).not.toContain('22');
  });

  it('keeps unparseable values as they are', () => {
    expect(formatBirthday('soon')).toBe('soon');
  });
});
