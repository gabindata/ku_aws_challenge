import Phaser from 'phaser';
import type { StyleReport } from '../types';

/**
 * 말투 리포트 표시 (공통규칙 §10).
 *
 * 레이더 차트는 더 이상 없다. 다섯 축을 "두 극 사이의 위치"로 한 줄에 나란히
 * 보여주고, 말의 호흡도 단위가 다르다는 이유로 따로 빼지 않는다.
 *
 * 지켜야 할 것:
 * - 축 옆에 숫자를 쓰지 않는다. 위치만 표시한다
 * - 어느 쪽 끝이 더 좋다고 말하거나 색으로 암시하지 않는다
 * - 태그는 코드명 대신 뜻과 횟수를 함께 쓴다
 * - 마지막에 다음 행동을 제안하지 않는다. 관찰만 보여준다
 *
 * 파일 이름은 프론트 담당과 상의 후 정리 예정.
 */
export class StyleRadarChart extends Phaser.GameObjects.Container {
  /**
   * 화면 순서는 StyleReport의 필드 순서 그대로다. 근거가 먼저고 축은 요약이다.
   *   1. observation — 가장 두드러졌던 특징 한 줄
   *   2. highlights  — 근거 발화 3~5개
   *   3. axes        — 다섯 축
   *   4. tags        — 스테이지 태그 집계
   */
  render(_report: StyleReport): void {
    // TODO: confidence가 'low'면 축을 흐리게 처리하고 진단이 성립하지 않음을 알린다
  }
}
