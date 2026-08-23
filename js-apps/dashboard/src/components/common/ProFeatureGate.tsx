import React from 'react';
import { Button, Flex, theme, Typography } from 'antd';
import { CrownOutlined } from '@ant-design/icons';
import { __, sprintf } from '@wordpress/i18n';
import useScreens from '../../hooks/useScreens';
import { useFeature } from '../../hooks/useFeature';
import { proUpgradeText } from '../../utils/pro';
import { PRICING_URL } from '../../utils/links';
import type { FeatureKey } from '../../types/global';

const { Title, Paragraph } = Typography;

interface ProUpgradeNoticeProps {
  /** Feature name shown in the teaser heading (e.g. "Segments"). */
  title: string;
  /** Optional one-line description of the feature. */
  description?: string;
  /**
   * Pad the teaser instead of centring it in the page height. For hosts that
   * size to their content (a modal, a drawer tab) rather than filling a page.
   */
  padding?: number | string;
}

/** Centered "this is a Pro feature" teaser with the upgrade CTA. */
export const ProUpgradeNotice = ({
  title,
  description,
  padding,
}: ProUpgradeNoticeProps) => {
  const { wps } = useScreens();
  const {
    token: { colorPrimary },
  } = theme.useToken();

  return (
    <Flex
      align="center"
      justify="center"
      style={{
        padding,
        minHeight: padding
          ? undefined
          : wps
            ? 'calc(100vh - 297px)'
            : 'calc(100vh - 242px)',
      }}
    >
      <Flex align="center" justify="center" vertical>
        <CrownOutlined style={{ fontSize: '50px', color: colorPrimary }} />
        <Title level={4} style={{ textAlign: 'center', margin: '16px 0 0 0' }}>
          {sprintf(
            /* translators: %s: Pro feature name */
            __('%s is a Pro feature', 'kelune-crm'),
            title
          )}
        </Title>
        <Paragraph
          style={{
            fontSize: '16px',
            color: '#666',
            textAlign: 'center',
            margin: '8px 0 0 0',
          }}
        >
          {description ?? proUpgradeText(title)}
        </Paragraph>
        <Button
          href={PRICING_URL}
          target="_blank"
          rel="noopener noreferrer"
          color="primary"
          variant="solid"
          className="kelune-crm-cc-btn-anchor-primary"
          style={{ margin: '20px 0 0 0' }}
        >
          {__('Upgrade to Pro', 'kelune-crm')}
        </Button>
      </Flex>
    </Flex>
  );
};

interface ProFeatureGateProps extends Omit<ProUpgradeNoticeProps, 'padding'> {
  /** Pro feature flag that unlocks the children. */
  feature: FeatureKey;
  children: React.ReactNode;
}

/**
 * Gate a Pro-only page/section. With the feature flag enabled (Pro add-on
 * active) the `children` render as normal; otherwise the upgrade teaser shows.
 * The children only mount when unlocked, so a gated Pro page never fetches its
 * (absent) REST endpoints while Pro is inactive.
 */
const ProFeatureGate = ({
  feature,
  title,
  description,
  children,
}: ProFeatureGateProps) => {
  const enabled = useFeature(feature);

  if (enabled) {
    return <>{children}</>;
  }

  return <ProUpgradeNotice title={title} description={description} />;
};

export default ProFeatureGate;
