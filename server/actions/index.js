// ============================================================
// 统一动作注册表
// ============================================================

import { firefoxActions } from './firefox.js';
import { cdpActions } from './cdp.js';
import { deepseekActions } from './deepseek.js';

// 合并所有动作
const allActions = {
  ...firefoxActions,
  ...cdpActions,
  ...deepseekActions
};

/**
 * 根据动作名获取动作信息
 * @param {string} action - 动作名称
 * @returns {{ handler: Function, channel: string, schema: Object } | null}
 */
export function getAction(action) {
  // 首先检查firefox通道
  if (firefoxActions[action]) {
    return { ...firefoxActions[action], channel: 'firefox' };
  }
  // 然后检查cdp通道
  if (cdpActions[action]) {
    return { ...cdpActions[action], channel: 'cdp' };
  }
  // 最后检查deepseek通道
  if (deepseekActions[action]) {
    return { ...deepseekActions[action], channel: 'deepseek' };
  }
  return null;
}

/**
 * 执行动作
 * @param {string} action - 动作名称
 * @param {Object} payload - 动作参数
 * @param {Object} bridgeWS - WebSocket服务实例（用于firefox通道）
 * @returns {Promise<any>}
 */
export async function executeAction(action, payload, bridgeWS = null) {
  const actionInfo = getAction(action);

  if (!actionInfo) {
    throw new Error(`未知动作: ${action}`);
  }

  // Firefox通道需要通过WebSocket发送任务
  if (actionInfo.channel === 'firefox') {
    if (!bridgeWS) {
      throw new Error('Firefox插件未连接');
    }
    // 用扩展认识的动作名（eval→execute_script 等），不要直接把 HTTP 动作名发过去
    return await bridgeWS.sendTask(actionInfo.extensionAction || action, payload);
  }

  // CDP和DeepSeek通道直接执行
  return await actionInfo.handler(payload);
}

/**
 * 获取所有动作列表
 * @returns {Array<{name: string, channel: string, description: string}>}
 */
export function listActions() {
  const actions = [];

  for (const [name, info] of Object.entries(firefoxActions)) {
    actions.push({ name, channel: 'firefox', description: info.description || '' });
  }
  for (const [name, info] of Object.entries(cdpActions)) {
    actions.push({ name, channel: 'cdp', description: info.description || '' });
  }
  for (const [name, info] of Object.entries(deepseekActions)) {
    actions.push({ name, channel: 'deepseek', description: info.description || '' });
  }

  return actions;
}
