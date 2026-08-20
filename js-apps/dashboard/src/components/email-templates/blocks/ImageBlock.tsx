import React from 'react';
import { __ } from '@wordpress/i18n';
import { PictureOutlined } from '@ant-design/icons';
import type { EmailBlock } from '@/types/models';

interface BlockProps {
  block: EmailBlock;
  isPreview?: boolean;
}

const ImageBlock = ({ block, isPreview = false }: BlockProps) => {
  const {
    src = '',
    alt = __('Image', 'kelune-crm'),
    link = '',
    width = 'auto',
    textAlign = 'center',
  } = block.styles || {};

  // line-height:0 kills the inline-block baseline gap under the image.
  const containerStyle: React.CSSProperties = {
    textAlign,
    lineHeight: 0,
  };

  // width 'auto' = natural size (capped); a percentage scales the image.
  // font-size/line-height give the alt text sane metrics if the image breaks.
  const imageStyle: React.CSSProperties = {
    width,
    maxWidth: '100%',
    height: 'auto',
    display: 'inline-block',
    fontSize: '16px',
    lineHeight: 1.6,
  };

  const renderImage = () => {
    if (!src) {
      return (
        <div
          style={{
            background: '#f0f0f0',
            border: '1px dashed #d9d9d9',
            borderRadius: '0',
            padding: '20px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            color: '#999',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <PictureOutlined
              style={{ fontSize: '48px', marginBottom: '8px' }}
            />
            <div>{__('No image selected', 'kelune-crm')}</div>
          </div>
        </div>
      );
    }

    const img = <img src={src} alt={alt} style={imageStyle} />;

    if (link && isPreview) {
      return (
        <a href={link} style={{ display: 'inline-block' }}>
          {img}
        </a>
      );
    }

    return img;
  };

  return <div style={containerStyle}>{renderImage()}</div>;
};

export default ImageBlock;
