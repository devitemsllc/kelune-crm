import { useCallback, useEffect, useState } from 'react';
import { Col, Flex, Form, Layout, Row, Spin, Steps, theme } from 'antd';
import { __ } from '@wordpress/i18n';
import { useDispatch } from '@store/hooks';
import {
  setSetupFinished,
  setSetupRunning,
  setSetupStep,
} from '@store/slices/setupWizardSlice';
import useScreens from '@hooks/useScreens';
import { useSetupWizard } from '@hooks/useSetupWizard';
import { useLicense } from '@hooks/useLicense';
import api from '@/services/api';
import LicenseStep from '@/components/setup-wizard/LicenseStep';
import WelcomeStep from '@/components/setup-wizard/WelcomeStep';
import ItemsStep from '@/components/setup-wizard/ItemsStep';
import type { SetupItem } from '@/components/setup-wizard/ItemsStep';
import FinishedStep from '@/components/setup-wizard/FinishedStep';

const { Content, Header } = Layout;

const emptyRows: SetupItem[] = [
  { id: '0', name: '' },
  { id: '0', name: '' },
  { id: '0', name: '' },
];

/**
 * First-run setup wizard: welcome + business identity, create lists, create
 * tags, and a congratulations screen. With the Pro add-on active a license step
 * is prepended, so activation happens before anything is configured. Progress
 * (step + finished) persists to the settings blob so the wizard resumes where it
 * left off and never re-opens once completed.
 */
const SetupWizard = () => {
  const dispatch = useDispatch();
  const { step: storedStep } = useSetupWizard();
  const { isLicenseRequired, isLicenseActive, isLicenseValid } = useLicense();
  const { token } = theme.useToken();
  const { xs, sm, md, wps } = useScreens();

  const [isLoading, setIsLoading] = useState(false);
  const [isSubLoading, setIsSubLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [listsData, setListsData] = useState<SetupItem[]>([]);
  const [tagsData, setTagsData] = useState<SetupItem[]>([]);

  const [listsForm] = Form.useForm();
  const [tagsForm] = Form.useForm();

  const { colorBgContainer, borderRadiusLG } = token;

  // Pro prepends a license step, which shifts every later index by one.
  const withLicense = isLicenseRequired();
  const finishStep = withLicense ? 4 : 3;

  // An unlicensed Pro install is pinned to the license step regardless of the
  // stored progress: installing Pro part-way through the wizard would otherwise
  // resume at a shifted index that lands past the step it just inserted.
  // Otherwise the stored step is clamped, since deactivating Pro shortens the
  // wizard and an index past the end would render nothing.
  const licenseSatisfied =
    !withLicense || (isLicenseActive() && isLicenseValid());
  const currentStep = licenseSatisfied ? Math.min(storedStep, finishStep) : 0;

  // Load the lists/tags that already exist so the user sees and can edit them
  // rather than creating duplicates. Re-run after each save/delete inside a step
  // so navigating Back reflects what was just stored (a create turns the row's
  // id from '0' into a real id, so the seeding below shows it).
  const loadData = useCallback(async () => {
    setFetching(true);
    try {
      const [lists, tags] = await Promise.all([
        api.lists.getAll({ per_page: 100, orderby: 'id', order: 'ASC' }),
        api.tags.getAll({ per_page: 100, orderby: 'id', order: 'ASC' }),
      ]);
      setListsData(
        (lists.data ?? []).map((item) => ({ id: item.id, name: item.name }))
      );
      setTagsData(
        (tags.data ?? []).map((item) => ({ id: item.id, name: item.name }))
      );
    } catch {
      setListsData([]);
      setTagsData([]);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Reseed the forms whenever the step or the loaded data changes: existing rows
  // when present, otherwise three empty rows to invite input.
  useEffect(() => {
    listsForm.setFieldValue('items', listsData.length ? listsData : emptyRows);
  }, [currentStep, listsForm, listsData]);

  useEffect(() => {
    tagsForm.setFieldValue('items', tagsData.length ? tagsData : emptyRows);
  }, [currentStep, tagsForm, tagsData]);

  // Persist the step (and finished flag) then reflect it in the store. Reaching
  // the final step marks the wizard finished; `running` keeps it mounted so the
  // congratulations screen shows until the user leaves.
  const storeSteps = useCallback(
    async (newStep: number, finished = false, running = true) => {
      const isFinished = finished || newStep === finishStep;
      setIsLoading(true);
      dispatch(setSetupRunning(running));
      try {
        await api.settings.update({
          setup_wizard_step: newStep,
          setup_wizard_finished: isFinished,
        });
        dispatch(setSetupStep(newStep));
        dispatch(setSetupFinished(isFinished));
      } finally {
        setIsLoading(false);
      }
    },
    [dispatch, finishStep]
  );

  const nextStep = useCallback(
    () => storeSteps(currentStep + 1),
    [storeSteps, currentStep]
  );
  // Leaving the license step resumes wherever the wizard actually was, so
  // installing Pro part-way through does not replay the steps already done.
  const advanceFromLicense = useCallback(
    () => storeSteps(Math.max(Math.min(storedStep, finishStep), 1)),
    [storeSteps, storedStep, finishStep]
  );
  const prevStep = useCallback(
    () => storeSteps(currentStep - 1),
    [storeSteps, currentStep]
  );
  const skipSetup = useCallback(
    () => storeSteps(currentStep, true, false),
    [storeSteps, currentStep]
  );
  const leaveWizard = useCallback(
    () => dispatch(setSetupRunning(false)),
    [dispatch]
  );

  const compactSteps = xs || sm || md;
  const stepTitles = [
    ...(withLicense ? [__('License', 'kelune-crm')] : []),
    __('Welcome', 'kelune-crm'),
    __('Lists', 'kelune-crm'),
    __('Tags', 'kelune-crm'),
    __('Finished', 'kelune-crm'),
  ];
  const stepItems = stepTitles.map((title) => ({
    title: compactSteps ? '' : title,
  }));

  const steps = [
    ...(withLicense
      ? [
          <LicenseStep
            key="step-license"
            setIsLoading={setIsSubLoading}
            nextStep={advanceFromLicense}
          />,
        ]
      : []),
    <WelcomeStep
      key="step-0"
      setIsLoading={setIsSubLoading}
      nextStep={nextStep}
      skipSetup={skipSetup}
    />,
    <ItemsStep
      key="step-1"
      form={listsForm}
      existingData={listsData}
      api={api.lists}
      title={__('Contact Lists', 'kelune-crm')}
      description={__(
        'Just enter the name of each list and click Save & Next!',
        'kelune-crm'
      )}
      placeholder={(index) =>
        // translators: %d: row number
        `${__('e.g. List', 'kelune-crm')} ${index}`
      }
      addLabel={__('Add More List', 'kelune-crm')}
      requiredMessage={__(
        'At least one list name is required to save.',
        'kelune-crm'
      )}
      savedMessage={__('Lists saved successfully', 'kelune-crm')}
      setIsLoading={setIsSubLoading}
      nextStep={nextStep}
      prevStep={prevStep}
      skipSetup={skipSetup}
      reloadData={loadData}
    />,
    <ItemsStep
      key="step-2"
      form={tagsForm}
      existingData={tagsData}
      api={api.tags}
      title={__('Contact Tags', 'kelune-crm')}
      description={__(
        'Just enter the name of each tag and click Save & Next!',
        'kelune-crm'
      )}
      placeholder={(index) => `${__('e.g. Tag', 'kelune-crm')} ${index}`}
      addLabel={__('Add More Tag', 'kelune-crm')}
      requiredMessage={__(
        'At least one tag name is required to save.',
        'kelune-crm'
      )}
      savedMessage={__('Tags saved successfully', 'kelune-crm')}
      setIsLoading={setIsSubLoading}
      nextStep={nextStep}
      prevStep={prevStep}
      skipSetup={skipSetup}
      reloadData={loadData}
    />,
    <FinishedStep key="step-3" onDone={leaveWizard} />,
  ];

  return (
    <Layout style={{ background: 'transparent' }}>
      <Header
        style={{
          position: wps ? 'static' : 'sticky',
          top: wps ? 0 : 32,
          width: '100%',
          height: 'auto',
          lineHeight: 'normal',
          background: colorBgContainer,
          borderBottom: '1px solid #f0f0f1',
          padding: '16px',
          zIndex: 1,
        }}
      >
        <Row align="middle" justify="center">
          <Col span={24} style={{ maxWidth: '782px', width: '100%' }}>
            <Steps
              current={currentStep}
              items={stepItems}
              responsive={false}
              className="kelune-crm-cc-setup-wizard-steps"
            />
          </Col>
        </Row>
      </Header>
      <Content
        style={{
          minHeight: wps ? 'calc(100vh - 215px)' : 'calc(100vh - 165px)',
          padding: '16px',
        }}
      >
        <Flex
          justify="center"
          align="center"
          style={{
            minHeight: wps ? 'calc(100vh - 255px)' : 'calc(100vh - 200px)',
          }}
        >
          <Layout
            style={{
              padding: '16px',
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
              maxWidth: '782px',
              width: '100%',
            }}
          >
            <Spin
              spinning={isLoading || isSubLoading || fetching}
              style={{ maxHeight: 'unset' }}
            >
              <Content style={{ padding: '16px' }}>
                {steps.map((element, index) => (
                  <div
                    key={index}
                    className={
                      index === currentStep ? '' : 'kelune-crm-cc-hidden'
                    }
                  >
                    {element}
                  </div>
                ))}
              </Content>
            </Spin>
          </Layout>
        </Flex>
      </Content>
    </Layout>
  );
};

export default SetupWizard;
