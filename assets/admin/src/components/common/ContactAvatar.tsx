import { Avatar } from 'antd';
import type { CSSProperties } from 'react';

interface ContactAvatarProps {
  email?: string;
  first_name?: string;
  last_name?: string;
  /**
   * The contact's avatar, resolved server-side (see Services/AvatarService):
   * their stored avatar if they have one, else a Gravatar when the admin has
   * opted in, else ''. Empty means render initials — never derive a Gravatar
   * URL client-side, or `use_gravatar_service` stops being a real kill switch.
   */
  avatar_url?: string;
  /** Omit to use AntD's default size, as the dashboard lists do. */
  size?: number;
  style?: CSSProperties;
}

/**
 * A contact's avatar, falling back to their initial on AntD's default styling —
 * every contact avatar in the dashboard renders through here, so they stay
 * consistent.
 *
 * A Gravatar URL asks for a 404 when the address has no account, which makes
 * AntD fall back to the child initial rather than showing a stranger's
 * placeholder image.
 */
const ContactAvatar = ({
  email,
  first_name,
  last_name,
  avatar_url,
  size,
  style,
}: ContactAvatarProps) => {
  const name = `${first_name ?? ''} ${last_name ?? ''}`.trim();
  const initial = (name || email || '?')[0]?.toUpperCase();

  return (
    <Avatar
      size={size}
      src={avatar_url || undefined}
      style={{ flexShrink: 0, ...style }}
    >
      {initial}
    </Avatar>
  );
};

export default ContactAvatar;
