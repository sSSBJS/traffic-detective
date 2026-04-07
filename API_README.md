1. 최종 서비스 방향
서비스 한 줄 정의

기본 운영 모델의 성능을 주기적으로 평가하고, 성능 저하 시 보고서 생성과 사용자 승인 기반 재학습을 수행하는 Traffic AIOps 웹 서비스

즉, 처음에 사용자가
dataset / entity / metric 을 고르는 구조는 빼고,

시스템 안에 이미 이렇게 정해져 있다고 보면 돼:

기본 데이터셋
기본 엔터티
기본 메트릭
현재 운영 모델(champion)
재학습 정책

사용자는 그 결과를 보고
유지할지 / 재학습할지만 결정하면 돼.

2. 최종 전체 흐름
최종 전체 흐름
시스템은 미리 설정된 운영 대상에 대해 현재 운영 모델의 예측과 성능 평가를 수행한다.
평가 결과를 바탕으로 성능 저하 여부를 판단한다.
성능이 정상 범위면 현재 모델을 유지하고 이력을 저장한다.
성능이 기준 이하이면 자동으로 보고서를 생성한다.
사용자는 보고서를 확인한 뒤 현재 모델을 유지할지, 재학습을 요청할지 결정한다.
사용자가 재학습을 요청하면, 사전에 정의된 정책에 따라 최신 데이터를 반영하여 재학습을 수행한다.
재학습이 완료되면 후보 모델의 성능을 다시 평가한다.
후보 모델이 기존 운영 모델보다 우수하면 운영 모델로 승격(promote)한다.
후보 모델이 기존 모델보다 우수하지 않으면 폐기한다.
평가 결과, 보고서, 사용자 결정, 재학습 결과, 승격 여부를 모두 저장한다.
3. 이 흐름에서 중요한 핵심 개념

이 프로젝트는 아래 6개 객체로 보면 쉬워.

1) 운영 모델

현재 실제 서비스에서 쓰는 모델
즉 champion model

2) 성능 평가

현재 운영 모델의 예측 성능을 다시 측정하는 단계

3) 보고서

성능이 떨어졌을 때 원인과 권장 조치를 정리한 결과물

4) 사용자 결정

보고서를 보고

유지
재학습 요청
중 하나를 누르는 것
5) 후보 모델

재학습 후 새로 나온 모델
즉 candidate model

6) 승격

candidate가 champion보다 좋으면 운영 모델로 교체하는 것

4. 추천 아키텍처 최종안
전체 구조

프론트와 백엔드는 이렇게 나누면 돼.

프론트엔드

사용자가 보는 화면

역할:

현재 모델 상태 보여주기
성능 평가 결과 보여주기
보고서 보여주기
재학습 승인/거절 버튼 제공
학습 진행 상황 보여주기
모델 이력 보여주기
백엔드

실제 로직 처리

역할:

정해진 기본 설정으로 평가 실행
성능 저하 판정
보고서 생성
사용자 결정 저장
재학습 job 실행
후보 모델 평가
승격/폐기 처리
전체 이력 저장
ML 파이프라인

실제 모델 관련 코드

역할:

데이터 전처리
학습
예측
평가
모델 저장
후보/운영 모델 비교
저장소

역할:

모델 파일 저장
평가 결과 저장
보고서 저장
사용자 결정 저장
로그/이력 저장
5. 화면 구성 최종안

프론트는 복잡하게 만들 필요 없어.
아래 4개 화면이면 충분해.

화면 1. 운영 대시보드

보여줄 것:

현재 운영 모델 이름
현재 운영 버전
마지막 학습 시각
최근 평가 결과
현재 상태: healthy / warning / degraded
최근 예측 그래프
최근 실제값 vs 예측값 그래프

목적:
사용자가 지금 모델 상태가 어떤지 한눈에 보는 화면

화면 2. 보고서 화면

보여줄 것:

성능 저하 요약
어떤 지표가 나빠졌는지
원인 추정
권장 조치
생성 시각

목적:
성능 저하가 왜 발생했는지 설명해주는 화면

화면 3. 재학습 승인 화면

보여줄 것:

현재 상태
재학습 필요 이유
사용할 정책(최근 30일 데이터, batch 단위 등)
버튼 2개
현재 모델 유지
재학습 요청

목적:
사용자가 의사결정하는 화면

화면 4. 모델 이력 / 재학습 이력 화면

보여줄 것:

언제 평가했는지
언제 보고서 생성됐는지
누가 유지 선택했는지 / 재학습 요청했는지
후보 모델 성능
승격 여부
이전 champion / 현재 champion

목적:
운영 기록을 확인하는 화면

6. 백엔드 API 최종안

여기서는 네 프로젝트에 맞게 진짜 필요한 것만 남길게.

기존처럼 dataset/entity/metric 선택 API는 빼고,
운영 대상은 시스템 내부 기본값으로 처리.

1) 현재 운영 상태 조회
GET /api/v1/system/status

설명:
현재 운영 중인 모델 상태와 최근 평가 결과를 조회한다.

response 예시
{
  "success": true,
  "data": {
    "system_name": "traffic-aiops-studio",
    "target_config": {
      "dataset_id": "cesnet_v1",
      "entity_id": "router_01",
      "metric": "bytes_per_sec"
    },
    "champion_model": {
      "model_version_id": "model_v12",
      "model_name": "sarimax_baseline",
      "trained_at": "2026-04-01T10:00:00+09:00"
    },
    "latest_health_status": "degraded",
    "latest_evaluation_id": "eval_001"
  },
  "message": "ok"
}
2) 성능 평가 실행
POST /api/v1/evaluations

설명:
기본 운영 설정을 기준으로 현재 운영 모델의 예측과 성능 평가를 수행한다.

request 예시
{
  "trigger_type": "manual"
}

trigger_type은

manual
scheduled
둘 중 하나로 두면 좋아.
response 예시
{
  "success": true,
  "data": {
    "evaluation_id": "eval_001",
    "status": "completed",
    "current_metrics": {
      "rmse": 12.0,
      "smape": 9.4,
      "r2": 0.74
    },
    "baseline_metrics": {
      "rmse": 10.0,
      "smape": 8.0,
      "r2": 0.85
    },
    "comparison": {
      "rmse_change_rate": 20.0,
      "smape_change_rate": 17.5,
      "r2_drop": 0.11
    },
    "health_status": "degraded",
    "recommended_action": "generate_report"
  },
  "message": "evaluation completed"
}
3) 최근 평가 결과 조회
GET /api/v1/evaluations/latest

설명:
가장 최근 성능 평가 결과를 조회한다.

4) 보고서 생성
POST /api/v1/reports

설명:
성능 저하 평가 결과를 바탕으로 자동 보고서를 생성한다.

request 예시
{
  "evaluation_id": "eval_001"
}
response 예시
{
  "success": true,
  "data": {
    "report_id": "report_001",
    "evaluation_id": "eval_001",
    "summary": "현재 운영 모델의 성능이 기준 대비 저하되었습니다.",
    "details": {
      "rmse": "기준 대비 20.0% 증가",
      "smape": "기준 대비 17.5% 증가",
      "r2": "기준 대비 0.11 감소"
    },
    "possible_causes": [
      "최근 데이터 패턴 변화",
      "트래픽 주기성 변화",
      "학습 데이터 최신성 부족"
    ],
    "recommended_actions": [
      "최근 30일 데이터로 재학습",
      "비교 모델 포함 재평가",
      "이상치/누락 데이터 점검"
    ],
    "status": "awaiting_user_decision"
  },
  "message": "report created"
}
5) 최근 보고서 조회
GET /api/v1/reports/latest

설명:
가장 최근 생성된 보고서를 조회한다.

6) 사용자 결정 저장
POST /api/v1/decisions

설명:
사용자가 보고서를 보고 유지 또는 재학습 요청을 선택한다.

request 예시 - 유지
{
  "report_id": "report_001",
  "decision": "keep",
  "comment": "현재 모델 유지"
}
request 예시 - 재학습 요청
{
  "report_id": "report_001",
  "decision": "retrain",
  "comment": "최근 데이터 반영하여 재학습 요청"
}
response 예시
{
  "success": true,
  "data": {
    "decision_id": "decision_001",
    "report_id": "report_001",
    "decision": "retrain",
    "status": "accepted"
  },
  "message": "decision saved"
}
7) 재학습 실행
POST /api/v1/training-jobs

설명:
재학습 요청이 승인된 경우 실제 재학습 작업을 시작한다.

request 예시
{
  "decision_id": "decision_001"
}
response 예시
{
  "success": true,
  "data": {
    "job_id": "job_001",
    "status": "queued"
  },
  "message": "training job created"
}
8) 재학습 상태 조회
GET /api/v1/training-jobs/{job_id}

설명:
재학습 진행 상태를 조회한다.

response 예시
{
  "success": true,
  "data": {
    "job_id": "job_001",
    "status": "running",
    "progress": 65,
    "current_stage": "training_candidate_model"
  },
  "message": "ok"
}

status는 이렇게 두면 좋음:

queued
running
completed
failed
9) 후보 모델 결과 조회
GET /api/v1/model-candidates/latest

설명:
가장 최근 재학습으로 생성된 후보 모델의 성능을 조회한다.

response 예시
{
  "success": true,
  "data": {
    "candidate_model_version_id": "model_v13",
    "model_name": "fourier_sarimax",
    "metrics": {
      "rmse": 10.8,
      "smape": 7.3,
      "r2": 0.86
    },
    "comparison_with_champion": {
      "is_better": true,
      "reason": "lower_rmse_and_smape_higher_r2"
    },
    "status": "candidate_ready"
  },
  "message": "ok"
}
10) 모델 승격
POST /api/v1/model-versions/{model_version_id}/promote

설명:
후보 모델이 더 우수할 경우 운영 모델로 승격한다.

response 예시
{
  "success": true,
  "data": {
    "previous_champion": "model_v12",
    "new_champion": "model_v13",
    "status": "promoted"
  },
  "message": "model promoted successfully"
}
11) 이력 조회
GET /api/v1/history

설명:
평가, 보고서, 사용자 결정, 재학습, 승격 이력을 조회한다.

response 예시
{
  "success": true,
  "data": [
    {
      "evaluation_id": "eval_001",
      "health_status": "degraded",
      "report_id": "report_001",
      "decision": "retrain",
      "job_id": "job_001",
      "candidate_model_version_id": "model_v13",
      "promotion_status": "promoted",
      "created_at": "2026-04-07T22:30:00+09:00"
    }
  ],
  "message": "ok"
}
7. 성능평가 기준 최종안

* 성능평가 기준은 나중에 정할거라서 최대한 간단하게 임시로만 구현해줘.

모델링 담당자가 나중에 주기 전까지는 아래처럼 임시 기준으로 넣으면 돼.

사용할 지표
RMSE
SMAPE
R2
임시 판정 규칙
healthy
RMSE 증가율 < 10%
SMAPE 증가율 < 10%
R2 감소폭 < 0.05
마지막 학습 후 30일 미만
warning
RMSE 증가율 10% 이상 15% 미만
또는 SMAPE 증가율 10% 이상 15% 미만
또는 R2 감소폭 0.05 이상 0.10 미만
또는 마지막 학습 후 30일 이상 45일 미만
degraded
RMSE 증가율 15% 이상
또는 SMAPE 증가율 15% 이상
또는 R2 감소폭 0.10 이상
또는 마지막 학습 후 45일 이상

문서에는 이렇게 적으면 돼:

현재 성능평가 기준은 임시 운영 기준이며, 추후 모델링 담당자가 제공하는 최종 평가 기준에 따라 metric 구성과 threshold는 변경될 수 있다.

8. 상태값 설계

이거 꼭 넣어.
프론트와 백엔드가 상태를 맞춰야 안 헷갈려.

시스템 상태
healthy
warning
degraded
보고서 상태
created
awaiting_user_decision
closed
사용자 결정 상태
keep
retrain
training job 상태
queued
running
completed
failed
candidate 상태
candidate_ready
rejected
promoted
9. DB 테이블 최종안

너무 많으면 힘드니까 진짜 필요한 것만 적을게.

1) system_config

기본 운영 설정 저장

컬럼 예시:

id
dataset_id
entity_id
metric
champion_model_version_id
evaluation_interval
retraining_window_days
batch_unit
batch_size
created_at
updated_at
2) model_versions

모델 버전 관리

컬럼 예시:

model_version_id
model_name
version
status
trained_at
train_start_date
train_end_date
rmse
smape
r2
artifact_path
created_at

status:

champion
candidate
rejected
archived
3) evaluations

성능 평가 결과 저장

컬럼 예시:

evaluation_id
model_version_id
rmse
smape
r2
baseline_rmse
baseline_smape
baseline_r2
rmse_change_rate
smape_change_rate
r2_drop
health_status
recommended_action
trigger_type
created_at
4) reports

자동 보고서 저장

컬럼 예시:

report_id
evaluation_id
summary
details_json
causes_json
recommendations_json
status
created_at
5) decisions

사용자 결정 저장

컬럼 예시:

decision_id
report_id
decision
comment
decided_by
created_at
6) training_jobs

재학습 작업 이력

컬럼 예시:

job_id
decision_id
status
progress
started_at
finished_at
log_path
created_candidate_model_version_id
7) promotion_logs

승격/폐기 이력

컬럼 예시:

id
previous_model_version_id
candidate_model_version_id
result
reason
created_at
10. 폴더 구조 최종 추천안

네 기존 구조를 유지하면서 조금 더 명확하게 하면 이렇게.

traffic-aiops-studio/
├── backend/
│   └── app/
│       ├── api/
│       │   ├── routes/
│       │   │   ├── status.py
│       │   │   ├── evaluations.py
│       │   │   ├── reports.py
│       │   │   ├── decisions.py
│       │   │   ├── training_jobs.py
│       │   │   ├── models.py
│       │   │   └── history.py
│       ├── core/
│       │   ├── config.py
│       │   └── database.py
│       ├── ml/
│       │   ├── preprocessing.py
│       │   ├── trainers.py
│       │   ├── evaluator.py
│       │   └── registry.py
│       ├── schemas/
│       │   ├── common.py
│       │   ├── evaluation.py
│       │   ├── report.py
│       │   ├── decision.py
│       │   ├── training_job.py
│       │   └── model_version.py
│       ├── services/
│       │   ├── status_service.py
│       │   ├── evaluation_service.py
│       │   ├── report_service.py
│       │   ├── decision_service.py
│       │   ├── training_service.py
│       │   ├── promotion_service.py
│       │   └── history_service.py
│       └── storage/
│           ├── repositories/
│           └── artifacts/
├── frontend/
│   ├── index.html
│   ├── dashboard.html
│   ├── report.html
│   ├── history.html
│   ├── css/
│   └── js/
├── data/
│   ├── artifacts/
│   ├── reports/
│   ├── models/
│   └── logs/
└── tests/
11. 구현 순서 최종안

이 순서대로 하면 안 꼬여.

1단계. 기본 운영 설정 고정

먼저 시스템 안에 기본값 넣기

예:

dataset_id = cesnet_v1
entity_id = router_01
metric = bytes_per_sec
champion_model = sarimax_baseline
retraining_window_days = 30

이건 system_config에 저장

2단계. 운영 모델 평가 API 만들기

먼저 POST /evaluations부터 구현

할 일:

system_config 읽기
champion 모델 불러오기
예측 수행
RMSE/SMAPE/R2 계산
기준과 비교
health_status 저장

이 단계가 제일 중요

3단계. 보고서 생성 API 만들기

health_status == degraded 면
POST /reports가 작동하게

할 일:

evaluation 읽기
요약문 생성
원인 후보 생성
권장 조치 생성
reports 테이블 저장
4단계. 사용자 결정 API 만들기

POST /decisions

할 일:

keep 또는 retrain 저장
retrain이면 다음 단계 가능하게
5단계. 재학습 job 만들기

POST /training-jobs

할 일:

최근 N일 데이터 불러오기
미리 정한 batch 정책 적용
모델 학습
후보 모델 저장
성능 평가
model_versions에 candidate로 저장
6단계. 후보 모델 비교 및 승격 API 만들기

POST /model-versions/{id}/promote

할 일:

candidate 성능과 champion 비교
candidate가 우수하면 champion 교체
아니면 rejected 처리
로그 저장
7단계. 이력 화면 만들기

마지막에 GET /history

할 일:

평가
보고서
사용자 결정
학습 job
승격 여부
한 번에 묶어 보여주기
12. 프론트에서 버튼 흐름

사용자 화면에서는 이렇게만 흘러가면 된다.

운영 대시보드
[성능 평가 실행] 버튼
결과 표시
degraded일 때
[보고서 보기] 버튼
보고서 화면
[현재 모델 유지]
[재학습 요청]
재학습 요청 후
[학습 상태 보기]
후보 모델 생성 후
[후보 모델 결과 보기]
[승격하기]

이 정도면 충분해.

13. 발표용 설명 문장 최종안

이 문장은 발표 자료나 보고서에 그대로 넣어도 괜찮아.

본 시스템은 사용자가 분석 대상을 직접 선택하는 구조가 아니라, 사전에 정의된 운영 대상에 대해 주기적으로 모델 성능을 평가하고, 성능 저하가 감지되면 자동으로 보고서를 생성한 뒤, 사용자 승인에 따라 재학습과 모델 승격을 수행하는 AIOps 운영 구조를 따른다.

조금 더 쉬운 버전:

이 서비스는 미리 정해진 트래픽 예측 모델을 지속적으로 모니터링하고, 성능이 떨어질 경우 보고서 생성, 사용자 승인, 재학습, 후보 모델 비교, 승격까지 이어지는 전체 운영 흐름을 웹으로 관리하는 시스템이다.

14. 네가 최종 문서에 넣으면 좋은 구성

문서 목차를 이렇게 잡으면 예뻐.

1. 프로젝트 개요
Traffic AIOps Studio 소개
목표
2. 시스템 전체 흐름
평가
성능 저하 판단
보고서 생성
사용자 결정
재학습
후보 모델 평가
승격/폐기
이력 저장
3. 아키텍처
프론트엔드
백엔드
ML 파이프라인
저장소
4. API 명세서
status
evaluations
reports
decisions
training-jobs
model-versions
history
5. 데이터베이스 설계
system_config
model_versions
evaluations
reports
decisions
training_jobs
promotion_logs
6. 성능평가 기준
임시 기준
추후 변경 가능성
7. 기대 효과
운영 자동화
사용자 승인 기반 재학습
모델 품질 관리
이력 기반 추적 가능
15. 제일 마지막 결론

네 최종안은 이렇게 기억하면 돼.

최종 핵심 구조

정해진 운영 모델
→ 성능 평가
→ 저하 감지
→ 자동 보고서 생성
→ 사용자 결정
→ 재학습
→ 후보 모델 평가
→ 승격 또는 폐기
→ 모든 이력 저장