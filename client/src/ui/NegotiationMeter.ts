import Phaser from 'phaser';
import type { AgreementMemoItem } from '../types';

/**
 * 진행 상황 표시.
 *
 * 협상 게이지(0~100 막대)는 더 이상 없다. 기획 공통규칙이 신뢰도·점수·게이지를
 * 쓰지 않기로 하면서, 화면에는 남은 시간과 "이미 성립한 합의"만 표시한다.
 * 남은 정답 체크리스트는 절대 표시하지 않는다 (공통규칙 §3).
 *
 * 파일 이름은 프론트 담당과 상의 후 정리 예정.
 */
export class NegotiationMeter extends Phaser.GameObjects.Container {
  /** 성립한 합의 목록. 새 항목이 추가되거나 취소될 때 NPC 복창과 함께 갱신된다. */
  updateMemo(_items: AgreementMemoItem[]): void {
    // TODO
  }

  /** 남은 시간. null이면 시간 제한 없음(튜토리얼)이라 타이머를 숨긴다. */
  updateTimer(_remainingSeconds: number | null): void {
    // TODO: 120초·30초에 경고 연출
  }
}
