#### 다음 실습 코드는 학습 목적으로만 사용 바랍니다. 문의 : audit@korea.ac.kr 임성열 Ph.D.
#### 제공되는 실습 코드는 완성된 버전이 아니며, 일부 이스터 에그 (개선이 필요한 발견 사항)을 포함하고 있습니다.

# pip install fastapi uvicorn[standard] pandas pytz numpy matplotlib scikit-learn keras tensorflow pydot graphviz

'''설치 패키지 설명 : 
# scikit-learn → sklearn.preprocessing.MinMaxScaler, sklearn.metrics.mean_squared_error
# keras, tensorflow → Sequential, LSTM, Dropout, Dense, load_model, plot_model
# pydot, graphviz → keras.utils.plot_model 사용 시 필요
# 참고: 이미지 내보내기 실패 시 OS에 Graphviz 시스템 패키지(예: brew install graphviz, apt-get install graphviz)도 설치해야 합니다.'''

import os
os.environ["MPLBACKEND"] = "Agg"
# FastAPI/uvicorn 같은 서버 환경에서는 창을 띄울 필요가 없으므로 Agg 백엔드로 고정

import numpy as np
import matplotlib.pyplot as plt
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
from keras.models import Sequential, load_model
from keras.layers import Dense, LSTM, Dropout
from keras.utils import plot_model
import os
import math
from sklearn.metrics import mean_squared_error
from config import DATA_PATH, MODEL_SAVE_PATH, MODEL_PLOT_PATH, MODEL_SHAPES_PLOT_PATH, PREDICTION_PLOT_PATH

# 데이터 로딩
dataset = pd.read_csv(DATA_PATH, index_col='Date', parse_dates=['Date'], encoding='utf-8')

# 데이터 전처리
training_set = dataset.loc[:'2016', ["High"]].values
test_set = dataset.loc['2017':, ["High"]].values

# 스케일링
sc = MinMaxScaler(feature_range=(0, 1))
training_set_scaled = sc.fit_transform(training_set)

# LSTM 입력 데이터 준비
X_train, y_train = [], []
for i in range(60, len(training_set)):
    X_train.append(training_set_scaled[i-60:i, 0])
    y_train.append(training_set_scaled[i, 0])
X_train, y_train = np.array(X_train), np.array(y_train)
X_train = np.reshape(X_train, (X_train.shape[0], X_train.shape[1], 1))

# 모델 구축
regressor = Sequential([
    LSTM(units=50, return_sequences=True, input_shape=(X_train.shape[1], 1)),
    Dropout(0.2),
    LSTM(units=50, return_sequences=True),
    Dropout(0.2),
    LSTM(units=50, return_sequences=True),
    Dropout(0.2),
    LSTM(units=50),
    Dropout(0.2),
    Dense(units=1)
])

# 모델 컴파일 및 학습
regressor.compile(optimizer='rmsprop', loss='mean_squared_error')
regressor.fit(X_train, y_train, epochs=2, batch_size=32)

# 모델 저장
regressor.save(MODEL_SAVE_PATH)
print(f"Model saved to '{MODEL_SAVE_PATH}'")

# 모델 구조 이미지 생성
plot_model(regressor, to_file=MODEL_PLOT_PATH)
plot_model(regressor, to_file=MODEL_SHAPES_PLOT_PATH, show_shapes=True)
print(f"Model structure saved to '{MODEL_PLOT_PATH}' and '{MODEL_SHAPES_PLOT_PATH}'")


# 🚀 **추가된 `process()` 함수**
def process(dataset):
    """ 주어진 데이터셋으로 모델을 로드하고 예측을 수행 """
    model = load_model(MODEL_SAVE_PATH)

    # 'High' 열 선택
    training_set = dataset.loc[:'2016', ["High"]].values
    test_set = dataset.loc['2017':, ["High"]].values

    # 데이터 스케일링
    sc = MinMaxScaler(feature_range=(0, 1))
    training_set_scaled = sc.fit_transform(training_set)

    # 테스트 데이터 준비
    dataset_total = pd.concat([dataset.loc[:'2016', "High"], dataset.loc['2017':, "High"]], axis=0)
    inputs = dataset_total[len(dataset_total) - len(test_set) - 60:].values
    inputs = inputs.reshape(-1, 1)
    inputs = sc.transform(inputs)

    X_test = []
    for i in range(60, len(inputs)):
        X_test.append(inputs[i-60:i, 0])
    X_test = np.array(X_test)
    X_test = np.reshape(X_test, (X_test.shape[0], X_test.shape[1], 1))

    # 모델 예측
    predicted_stock_price = model.predict(X_test)
    predicted_stock_price = sc.inverse_transform(predicted_stock_price)

    # 결과 시각화 및 평가
    result_visualizing = plot_predictions(test_set, predicted_stock_price)
    result_evaluating = return_rmse(test_set, predicted_stock_price)

    return result_visualizing, result_evaluating


# 🚀 **추가된 `plot_predictions()` 및 `return_rmse()` 함수**
def plot_predictions(test, predicted):
    plt.clf()  # 이전 그래프 초기화
    plt.plot(test, color='red', label='Real IBM Stock Price')
    plt.plot(predicted, color='blue', label='Predicted IBM Stock Price')
    plt.title('IBM Stock Price Prediction')
    plt.xlabel('Time')
    plt.ylabel('IBM Stock Price')
    plt.legend()
    plt.savefig(PREDICTION_PLOT_PATH)
    return PREDICTION_PLOT_PATH

def return_rmse(test, predicted):
    rmse = math.sqrt(mean_squared_error(test, predicted))
    result_msg = f"The root mean squared error is {rmse}."
    print(result_msg)
    return result_msg
