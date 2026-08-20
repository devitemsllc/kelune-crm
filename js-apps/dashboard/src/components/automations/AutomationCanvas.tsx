import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactFlow, {
  Controls,
  Background,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  MiniMap,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Button,
  Space,
  Row,
  Col,
  Tooltip,
  Dropdown,
  InputNumber,
  Form,
  Modal,
  Typography,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  PlusOutlined,
  MoreOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { __, sprintf } from '@wordpress/i18n';
import InlineSwitch from '../common/InlineSwitch';
import ModalFooter from '../common/ModalFooter';
import { useListState } from '../../hooks/useListState';
import { findActionType } from './actionTypeOptions';
import { automationStatusLabel } from './typeLabels';
import TriggerNode from './nodes/TriggerNode';
import ActionNode from './nodes/ActionNode';
import ConditionNode from './nodes/ConditionNode';
import DelayNode from './nodes/DelayNode';
import AddStepDrawer from './AddStepDrawer';
import type { Automation, AutomationStep } from '@/types/models';
import SubmitOnEnter from '../common/SubmitOnEnter';

const { Title } = Typography;

// Canvas-height preference bounds. Modelled on the email-template Content Width
// control (step 10, "px" addon): a sensible floor/ceiling with a round default.
const CANVAS_HEIGHT_MIN = 300;
const CANVAS_HEIGHT_MAX = 2000;
const CANVAS_HEIGHT_DEFAULT = 600;

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  delay: DelayNode,
};

interface AutomationCanvasProps {
  automationId?: number | string;
  /** The automation record; supplies the title, status and canvas trigger. */
  automation?: Automation | null;
  initialSteps?: AutomationStep[];
  /** Persists the graph and resolves to the saved step ids, in payload order. */
  onSave?: (
    steps: Record<string, unknown>[]
  ) => Promise<number[] | undefined> | void;
  /** Opens the automation's settings (name, description, re-entry). */
  onEditInfo?: () => void;
  /** Opens the trigger node's editor — the trigger lives on the record. */
  onEditTrigger?: () => void;
  onActivate?: () => void;
  onPause?: () => void;
}

const AutomationCanvas = ({
  automationId,
  automation,
  initialSteps = [],
  onSave,
  onEditInfo,
  onEditTrigger,
  onActivate,
  onPause,
}: AutomationCanvasProps) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const isInitialized = useRef(false);
  // The live ReactFlow instance, captured on init, used to pan the viewport to a
  // freshly inserted step so the user sees where it landed.
  const rfRef = useRef<ReactFlowInstance | null>(null);

  const automationName = automation?.name;
  const status = automation?.status;
  const triggerType = automation?.trigger_type;
  const triggerConfig = automation?.trigger_config;
  const isActive = status === 'active';

  // The automation's trigger, read through refs so seeding the trigger node
  // (loadStepsToCanvas / addTriggerNode) never lists these props as deps — a
  // record update would otherwise re-run the init effect and reload the canvas.
  const triggerTypeRef = useRef(triggerType);
  const triggerConfigRef = useRef(triggerConfig);
  useEffect(() => {
    triggerTypeRef.current = triggerType;
    triggerConfigRef.current = triggerConfig;
    // The trigger node mirrors the record, so a settings save must be reflected
    // on the canvas without reloading the graph.
    setNodes((nds) =>
      nds.map((node) =>
        node.type === 'trigger'
          ? {
              ...node,
              data: {
                ...node.data,
                trigger_type: triggerType,
                trigger_config: triggerConfig ?? {},
              },
            }
          : node
      )
    );
  }, [triggerType, triggerConfig]);

  // Autosave bookkeeping. The workflow persists itself on every meaningful
  // canvas change — there is no manual "Save Workflow" button; success/failure is
  // reported with a toast. lastSavedRef holds the JSON last sent so an unchanged
  // canvas (e.g. the load echo, or pure selection) never re-saves; saveTimerRef
  // debounces bursts (drag, rapid edits).
  const [addStepOpen, setAddStepOpen] = useState(false);
  // The action/condition/delay node currently open in the Add/Edit Step drawer,
  // or null when the drawer is adding a new step.
  const [editNode, setEditNode] = useState<Node | null>(null);
  // Canvas height is a user view-preference, persisted in the shared list-state
  // store (same mechanism as listing-page filters) so it survives reloads.
  const [builderPrefs, setBuilderPrefs] = useListState('automation_builder', {
    canvasHeight: CANVAS_HEIGHT_DEFAULT,
  });
  const [heightModalOpen, setHeightModalOpen] = useState(false);
  const [heightDraft, setHeightDraft] = useState<number>(CANVAS_HEIGHT_DEFAULT);
  const lastSavedRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset when automation changes
  useEffect(() => {
    isInitialized.current = false;
    setNodes([]);
    setEdges([]);
  }, [automationId]);

  // Convert the React Flow graph into the ordered step payload the bulk-save
  // endpoint expects. Parent links are sent as indices (not ids) and the branch
  // is carried by the incoming edge's source handle. Returns null when there is
  // no trigger yet — an incomplete graph that must not be persisted.
  const buildStepsPayload = useCallback(
    (nodeList: Node[], edgeList: Edge[]): Record<string, unknown>[] | null => {
      const hasTrigger = nodeList.some((node) => node.type === 'trigger');
      if (!hasTrigger) {
        return null;
      }

      const nodeIdToIndex: Record<string, number> = {};
      nodeList.forEach((node, index) => {
        nodeIdToIndex[node.id] = index;
      });

      return nodeList.map((node, index) => {
        const incomingEdge = edgeList.find((edge) => edge.target === node.id);
        const parentIndex = incomingEdge
          ? nodeIdToIndex[incomingEdge.source]
          : null;
        const branchType = incomingEdge?.sourceHandle || null;

        return {
          // A node loaded from (or already saved to) the server carries its row
          // id as its node id, so the save updates that row in place. Steps
          // must keep their ids: queue rows point at them, and a contact
          // mid-workflow would be stranded if they were recreated.
          id: /^\d+$/.test(node.id) ? Number(node.id) : null,
          automation_id: automationId,
          step_order: index + 1,
          step_type: node.type,
          label: node.data.label || null,
          parent_index: parentIndex,
          branch_type: branchType,
          action_type: node.data.action_type || null,
          action_config: node.data.action_config || {},
          condition_type: node.data.condition_type || null,
          condition_config: node.data.condition_config || {},
          delay_type: node.data.delay_type || null,
          delay_value: node.data.delay_value || null,
          position_x: Math.round(node.position.x),
          position_y: Math.round(node.position.y),
        };
      });
    },
    [automationId]
  );

  /**
   * Adopt the ids the server assigned to newly inserted steps, so the next save
   * updates those rows instead of inserting duplicates. Renaming a node means
   * re-pointing its edges too.
   */
  const applyServerIds = useCallback((sourceNodes: Node[], ids: number[]) => {
    const renamed = new Map<string, string>();
    sourceNodes.forEach((node, index) => {
      const next = String(ids[index] ?? '');
      if (next && next !== node.id) {
        renamed.set(node.id, next);
      }
    });

    if (renamed.size === 0) {
      return;
    }

    setNodes((nds) =>
      nds.map((node) =>
        renamed.has(node.id)
          ? { ...node, id: renamed.get(node.id) as string }
          : node
      )
    );
    setEdges((eds) =>
      eds.map((edge) => {
        const source = renamed.get(edge.source) ?? edge.source;
        const target = renamed.get(edge.target) ?? edge.target;
        return { ...edge, source, target, id: `e${source}-${target}` };
      })
    );
  }, []);

  // Push the current graph to the server, reporting the outcome with a toast.
  const persist = useCallback(
    async (
      payload: Record<string, unknown>[],
      serialized: string,
      sourceNodes: Node[]
    ) => {
      if (!automationId || !onSave) {
        return;
      }
      lastSavedRef.current = serialized;
      try {
        const ids = await onSave(payload);
        if (Array.isArray(ids) && ids.length === sourceNodes.length) {
          applyServerIds(sourceNodes, ids);
          // Re-stamp with the ids the graph now carries. The payload is in node
          // order, so substituting them yields exactly what the next autosave
          // pass would build — without it, adopting the ids reads as a fresh
          // edit and triggers a second, identical save.
          lastSavedRef.current = JSON.stringify(
            payload.map((step, index) => ({ ...step, id: ids[index] }))
          );
        }
        message.success(__('Workflow saved', 'kelune-crm'));
      } catch {
        // Un-stamp so the next change (or a fresh edit) re-attempts the save.
        lastSavedRef.current = null;
        message.error(__('Failed to save workflow', 'kelune-crm'));
      }
    },
    [automationId, onSave, applyServerIds]
  );

  const loadStepsToCanvas = useCallback(
    (steps: AutomationStep[]) => {
      const newNodes: Node[] = steps.map((step) => ({
        id: String(step.id),
        type: step.step_type,
        position: { x: step.position_x || 250, y: step.position_y || 100 },
        data: {
          ...step,
          label:
            step.label ||
            step.action_type ||
            step.condition_type ||
            __('Step', 'kelune-crm'),
          // The trigger's type/config live on the automation record, not the
          // step row, so seed them from the record for display.
          ...(step.step_type === 'trigger'
            ? {
                trigger_type: triggerTypeRef.current,
                trigger_config: triggerConfigRef.current ?? {},
              }
            : {}),
        },
      }));

      // Create edges based on parent relationships
      const newEdges: Edge[] = [];
      steps.forEach((step) => {
        if (step.parent_step_id) {
          // Find parent step to determine source handle
          const parentStep = steps.find((s) => s.id === step.parent_step_id);
          let sourceHandle: string | undefined;

          if (parentStep) {
            // If parent is a condition, use branch_type (yes/no)
            if (parentStep.step_type === 'condition' && step.branch_type) {
              sourceHandle = step.branch_type;
            } else if (parentStep.step_type === 'trigger') {
              sourceHandle = 'trigger-output';
            } else if (parentStep.step_type === 'action') {
              sourceHandle = 'action-output';
            } else if (parentStep.step_type === 'delay') {
              sourceHandle = 'delay-output';
            }
          }

          // Determine targetHandle based on target node type
          let targetHandle: string | undefined;
          switch (step.step_type) {
            case 'trigger':
              targetHandle = undefined; // Triggers don't have input handles
              break;
            case 'action':
              targetHandle = 'action-input';
              break;
            case 'condition':
              targetHandle = 'condition-input';
              break;
            case 'delay':
              targetHandle = 'delay-input';
              break;
            default:
              targetHandle = undefined;
          }

          newEdges.push({
            id: `e${step.parent_step_id}-${step.id}`,
            source: String(step.parent_step_id),
            target: String(step.id),
            sourceHandle: sourceHandle,
            targetHandle: targetHandle,
            animated: true,
          });
        }
      });

      setNodes(newNodes);
      setEdges(newEdges);
      // Stamp the loaded graph as already-saved so the autosave effect that runs
      // right after this hydration recognises it as unchanged and does not echo
      // it straight back to the server.
      const loaded = buildStepsPayload(newNodes, newEdges);
      lastSavedRef.current = loaded ? JSON.stringify(loaded) : null;
    },
    [buildStepsPayload]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Filter out trigger node deletion attempts
      const filteredChanges = changes.filter((change) => {
        if (change.type === 'remove') {
          const nodeToRemove = nodes.find((n) => n.id === change.id);
          if (nodeToRemove && nodeToRemove.type === 'trigger') {
            message.warning(
              __(
                'Trigger step cannot be deleted. You can change the trigger type in settings.',
                'kelune-crm'
              )
            );
            return false; // Block this change
          }
        }
        return true; // Allow other changes
      });

      setNodes((nds) => applyNodeChanges(filteredChanges, nds));
    },
    [nodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  /**
   * Why a connection is not allowed, or null when it is.
   *
   * A contact walks one path: the executor resolves a single successor per step
   * (per branch, for a condition) and carries one queue row. So a step takes one
   * outgoing link per handle and one incoming link — anything else would be
   * drawn but never run, or silently dropped on save.
   */
  const connectionError = useCallback(
    (connection: Connection): string | null => {
      const { source, target, sourceHandle } = connection;

      if (!source || !target) {
        return __('Connect two steps to link them.', 'kelune-crm');
      }
      if (source === target) {
        return __('A step cannot connect to itself.', 'kelune-crm');
      }
      if (edges.some((edge) => edge.target === target)) {
        return __(
          'That step already follows another one. Remove its existing connection first.',
          'kelune-crm'
        );
      }
      if (
        edges.some(
          (edge) =>
            edge.source === source &&
            (edge.sourceHandle ?? null) === (sourceHandle ?? null)
        )
      ) {
        return __(
          'This step already leads somewhere. Remove that connection first, or use a condition to branch.',
          'kelune-crm'
        );
      }

      return null;
    },
    [edges]
  );

  const isValidConnection = useCallback(
    (connection: Connection) => connectionError(connection) === null,
    [connectionError]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      const error = connectionError(params);
      if (error) {
        message.warning(error);
        return;
      }
      setEdges((eds) => addEdge({ ...params, animated: true }, eds));
    },
    [connectionError]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // The trigger has its own drawer: it is stored on the automation record
      // rather than as a step, so it cannot go through the Add/Edit Step drawer.
      if (node.type === 'trigger') {
        onEditTrigger?.();
        return;
      }
      setEditNode(node);
      setAddStepOpen(true);
    },
    [onEditTrigger]
  );

  const addTriggerNode = useCallback(() => {
    setNodes((nds) => {
      // Check if trigger already exists to prevent duplicates
      const hasTrigger = nds.some((node) => node.type === 'trigger');
      if (hasTrigger) {
        return nds; // Don't add another trigger
      }

      const newNode = {
        id: `trigger-${Date.now()}`,
        type: 'trigger',
        position: { x: 250, y: 50 },
        data: {
          label: __('Trigger Event', 'kelune-crm'),
          trigger_type: triggerTypeRef.current || 'contact_created',
          trigger_config: triggerConfigRef.current ?? {},
        },
      };
      return [...nds, newNode];
    });
  }, []);

  // Initialize canvas with existing steps
  useEffect(() => {
    if (initialSteps && initialSteps.length > 0) {
      loadStepsToCanvas(initialSteps);
      isInitialized.current = true;
    } else if (!isInitialized.current) {
      // Only add default trigger once on first initialization
      addTriggerNode();
      isInitialized.current = true;
    }
  }, [initialSteps, loadStepsToCanvas, addTriggerNode]);

  // Derive a canvas label when the user left the step's Label field blank.
  const defaultStepLabel = (
    stepType: 'action' | 'condition' | 'delay',
    values: Record<string, unknown>
  ): string => {
    if (stepType === 'action') {
      return (
        findActionType(values.action_type as string)?.title ??
        __('Action', 'kelune-crm')
      );
    }
    if (stepType === 'delay') {
      return sprintf(
        // translators: %1$s: amount, %2$s: time unit (e.g. 2 days)
        __('Wait %1$s %2$s', 'kelune-crm'),
        values.delay_value ?? 1,
        values.delay_type ?? 'days'
      );
    }
    const conditionType = (values.condition_type as string) || 'condition';
    return conditionType
      .replace(/_/g, ' ')
      .replace(/^./, (c) => c.toUpperCase());
  };

  // Commit a step from the Add/Edit Step drawer: insert a new node or update the
  // edited one (its type may have changed via the tabs), then persist the
  // workflow at once (no debounce — this is an explicit save).
  const handleSubmitStep = (
    stepType: 'action' | 'condition' | 'delay',
    values: Record<string, unknown>,
    editId?: string
  ) => {
    const label =
      (values.label as string) || defaultStepLabel(stepType, values);
    let next: Node[];
    let insertedNode: Node | null = null;
    if (editId) {
      // Replace data wholesale (not merge): a type switch must not leave the
      // previous type's config keys behind in the node.
      next = nodes.map((node) =>
        node.id === editId
          ? { ...node, type: stepType, data: { label, ...values } }
          : node
      );
    } else {
      // Drop the new step just below the lowest existing node — a readable
      // column — rather than stacking by count where it can land off-screen. It
      // starts selected so it reads as "the one just added".
      const lowestY = nodes.reduce(
        (low, node) => Math.max(low, node.position.y),
        0
      );
      const newNode: Node = {
        id: `${stepType}-${Date.now()}`,
        type: stepType,
        position: { x: 250, y: nodes.length ? lowestY + 150 : 50 },
        data: { label, ...values },
        selected: true,
      };
      insertedNode = newNode;
      next = [
        ...nodes.map((node) =>
          node.selected ? { ...node, selected: false } : node
        ),
        newNode,
      ];
    }
    setNodes(next);

    const payload = buildStepsPayload(next, edges);
    if (payload) {
      void persist(payload, JSON.stringify(payload), next);
    }

    // Pan (keeping the current zoom) to centre the new step in view so the user
    // can see exactly what was added and where.
    if (insertedNode) {
      const zoom = rfRef.current?.getZoom() ?? 1;
      rfRef.current?.setCenter(
        insertedNode.position.x + 120,
        insertedNode.position.y + 40,
        { zoom, duration: 500 }
      );
    }
  };

  // Autosave: whenever the graph actually changes, debounce a bulk save. The
  // load echo and no-op changes (selection) are filtered by comparing against the
  // last-saved JSON, so only real edits — a step added, configured, moved,
  // deleted, or reconnected — hit the network.
  useEffect(() => {
    if (!automationId || !onSave || !isInitialized.current) {
      return;
    }
    const payload = buildStepsPayload(nodes, edges);
    if (!payload) {
      return; // No trigger yet — nothing valid to persist.
    }
    const serialized = JSON.stringify(payload);
    if (serialized === lastSavedRef.current) {
      return; // Unchanged since the last save.
    }
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      void persist(payload, serialized, nodes);
    }, 700);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [nodes, edges, automationId, onSave, buildStepsPayload, persist]);

  // Remove a step node (never the trigger — it is locked) and its connected
  // edges, then persist. Used by the Add/Edit drawer's delete action.
  const handleDeleteNode = (nodeId: string) => {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target || target.type === 'trigger') {
      return;
    }
    const nextNodes = nodes.filter((n) => n.id !== nodeId);
    const nextEdges = edges.filter(
      (e) => e.source !== nodeId && e.target !== nodeId
    );
    setNodes(nextNodes);
    setEdges(nextEdges);
    setAddStepOpen(false);
    setEditNode(null);
    const payload = buildStepsPayload(nextNodes, nextEdges);
    if (payload) {
      void persist(payload, JSON.stringify(payload), nextNodes);
    }
  };

  const openHeightModal = () => {
    setHeightDraft(builderPrefs.canvasHeight);
    setHeightModalOpen(true);
  };

  const saveHeight = () => {
    const clamped = Math.min(
      CANVAS_HEIGHT_MAX,
      Math.max(
        CANVAS_HEIGHT_MIN,
        Math.round(heightDraft || CANVAS_HEIGHT_DEFAULT)
      )
    );
    setBuilderPrefs({ canvasHeight: clamped });
    setHeightModalOpen(false);
  };

  const title = automationName || __('Workflow Builder', 'kelune-crm');

  return (
    <div>
      {/* Header — automation title with its settings, status and "Add Step"
          actions. Steps are added through the tabbed Add Step drawer. */}
      <Row
        justify="space-between"
        align="middle"
        wrap={false}
        gutter={8}
        style={{ marginBottom: 24 }}
      >
        <Col flex="auto" style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              minWidth: 0,
            }}
          >
            <Tooltip title={__('Back to automations', 'kelune-crm')}>
              <Button
                type="text"
                size="small"
                icon={<ArrowLeftOutlined />}
                href="#/automations"
                style={{ flex: 'none' }}
              />
            </Tooltip>
            <Title
              level={4}
              ellipsis={{ tooltip: title }}
              style={{ margin: 0, fontWeight: 500, minWidth: 0 }}
            >
              {title}
            </Title>
            <Tooltip title={__('Edit info', 'kelune-crm')}>
              <Button
                color="default"
                variant="text"
                size="small"
                icon={<EditOutlined />}
                onClick={onEditInfo}
                style={{ flex: 'none' }}
              />
            </Tooltip>
          </div>
        </Col>
        <Col flex="none">
          <Space>
            {/* Enrolment on/off, and the header's only status readout. */}
            <InlineSwitch
              inline
              style={{ marginBottom: 0, marginInlineEnd: 8 }}
              label={automationStatusLabel(status)}
              checked={isActive}
              onChange={(checked) => (checked ? onActivate?.() : onPause?.())}
            />
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  {
                    key: 'canvas-height',
                    label: __('Canvas Height', 'kelune-crm'),
                    onClick: openHeightModal,
                  },
                ],
              }}
            >
              <Tooltip title={__('More options', 'kelune-crm')}>
                <Button icon={<MoreOutlined />} />
              </Tooltip>
            </Dropdown>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditNode(null);
                setAddStepOpen(true);
              }}
            >
              {__('Add Step', 'kelune-crm')}
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Canvas Area — height is a saved user preference (see More → Canvas
          height). */}
      <div
        style={{
          height: `${builderPrefs.canvasHeight}px`,
          border: '1px solid #d9d9d9',
          borderRadius: 8,
          position: 'relative',
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onInit={(instance) => {
            rfRef.current = instance;
          }}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          proOptions={{ hideAttribution: true }}
          fitView
        >
          <Background color="#aaa" gap={16} />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              switch (node.type) {
                case 'trigger':
                  return '#faad14';
                case 'action':
                  return '#1890ff';
                case 'condition':
                  return '#fa8c16';
                case 'delay':
                  return '#597ef7';
                default:
                  return '#ddd';
              }
            }}
          />
        </ReactFlow>
      </div>

      {/* Canvas height preference — centered modal, mirrors the small add/edit
          modals on listing pages. */}
      <Modal
        destroyOnHidden
        centered
        width={420}
        title={__('Canvas Height', 'kelune-crm')}
        open={heightModalOpen}
        onCancel={() => setHeightModalOpen(false)}
        footer={
          <ModalFooter
            okText={__('Save', 'kelune-crm')}
            onOk={saveHeight}
            onCancel={() => setHeightModalOpen(false)}
          />
        }
      >
        <Form layout="vertical" onFinish={saveHeight}>
          <Form.Item
            label={__('Workflow canvas height', 'kelune-crm')}
            help={sprintf(
              // translators: %1$d: minimum height in pixels, %2$d: maximum height in pixels
              __('Between %1$d and %2$d pixels', 'kelune-crm'),
              CANVAS_HEIGHT_MIN,
              CANVAS_HEIGHT_MAX
            )}
            style={{ marginBottom: 0 }}
          >
            <InputNumber
              autoFocus
              value={heightDraft}
              onChange={(value) =>
                setHeightDraft(value ?? CANVAS_HEIGHT_DEFAULT)
              }
              min={CANVAS_HEIGHT_MIN}
              max={CANVAS_HEIGHT_MAX}
              step={10}
              addonAfter="px"
              style={{ width: '100%' }}
            />
          </Form.Item>
          <SubmitOnEnter />
        </Form>
      </Modal>

      {/* Add/Edit Step — tabbed drawer (Action / Condition / Delay) that picks
          and configures a step, then inserts a new one or updates the clicked
          node, and saves. editNode null = adding. */}
      <AddStepDrawer
        open={addStepOpen}
        editNode={editNode}
        onClose={() => {
          setAddStepOpen(false);
          setEditNode(null);
        }}
        onSubmit={handleSubmitStep}
        onDelete={handleDeleteNode}
      />
    </div>
  );
};

export default AutomationCanvas;
