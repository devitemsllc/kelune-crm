import React, { type ComponentProps } from 'react';
import { Flex, Result } from 'antd';
import useScreens from '../../hooks/useScreens';

type ResultStatus = ComponentProps<typeof Result>['status'];

interface ErrorStateProps {
  status?: ResultStatus;
  title?: React.ReactNode;
  subTitle?: React.ReactNode;
  extra?: React.ReactNode;
}

/**
 * Centered full-area error/result state. Fills the remaining height inside the
 * app Content shell (mirrors the Content min-height minus its padding), so the
 * Result sits centered without introducing a second scrollbar.
 */
const ErrorState = ({
  status = '404',
  title,
  subTitle,
  extra,
}: ErrorStateProps) => {
  const { wps } = useScreens();

  return (
    <Flex
      align="center"
      justify="center"
      style={{
        minHeight: wps ? 'calc(100vh - 297px)' : 'calc(100vh - 242px)',
      }}
    >
      <Result status={status} title={title} subTitle={subTitle} extra={extra} />
    </Flex>
  );
};

export default ErrorState;
