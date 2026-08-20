import { Button, Flex, Image, Input, Space, Typography } from 'antd';
import {
  DeleteOutlined,
  PictureOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { __ } from '@wordpress/i18n';
import { isMediaLibraryAvailable, openMediaLibrary } from '@/utils/wpMedia';

const { Text } = Typography;

interface ImagePickerProps {
  /** Image URL. Injected by Form.Item. */
  value?: string;
  /** Injected by Form.Item. */
  onChange?: (value: string) => void;
  /** Title of the media library modal. */
  title?: string;
  /** Preview box size in px. */
  width?: number;
  height?: number;
}

/**
 * Image field backed by the WordPress media library: clickable preview, the
 * selected URL in a read-only input, and an Upload / Remove pair.
 *
 * Stores the attachment URL only. The picked image is an admin-authored,
 * publicly reachable asset (it renders on our public pages), which is exactly
 * what the library is for — so no upload endpoint of our own is needed.
 *
 * A real controlled field: the value lives in the form store via value/onChange,
 * so picking an image marks the form dirty like any other input would.
 */
const ImagePicker = ({
  value = '',
  onChange,
  title = __('Select image', 'kelune-crm'),
  width = 80,
  height = 80,
}: ImagePickerProps) => {
  const handleSelect = async () => {
    const attachment = await openMediaLibrary({
      title,
      buttonText: __('Use this image', 'kelune-crm'),
      type: 'image',
    });

    if (attachment?.url) {
      onChange?.(attachment.url);
    }
  };

  if (!isMediaLibraryAvailable()) {
    return (
      <Text type="secondary">
        {__('The WordPress media library is unavailable.', 'kelune-crm')}
      </Text>
    );
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {value ? (
        <Image
          src={value}
          width={width}
          height={height}
          preview={false}
          alt=""
          onClick={handleSelect}
          style={{
            cursor: 'pointer',
            objectFit: 'cover',
            border: '1px solid #f0f0f0',
            borderRadius: 6,
          }}
        />
      ) : (
        // Empty state doubles as the drop target: same box, same click, so the
        // control does not shift once an image is chosen.
        <Flex
          align="center"
          justify="center"
          onClick={handleSelect}
          style={{
            width,
            height,
            cursor: 'pointer',
            border: '1px dashed #d9d9d9',
            borderRadius: 6,
            background: '#fafafa',
          }}
        >
          <PictureOutlined
            style={{ fontSize: 24, color: 'rgba(0, 0, 0, 0.25)' }}
          />
        </Flex>
      )}

      <Input
        value={value}
        readOnly
        placeholder={__('Nothing selected', 'kelune-crm')}
        onClick={handleSelect}
        style={{ cursor: 'pointer' }}
      />

      <Space>
        <Button size="small" icon={<UploadOutlined />} onClick={handleSelect}>
          {__('Upload', 'kelune-crm')}
        </Button>
        {value ? (
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => onChange?.('')}
          />
        ) : null}
      </Space>
    </Space>
  );
};

export default ImagePicker;
