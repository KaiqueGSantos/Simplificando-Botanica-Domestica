#pragma once

#include <math.h>

enum LigacaoLdr { LDR_NAO_CONFIGURADO, LDR_NO_VCC, LDR_NO_GND };

// Percentual relativo aos pontos de calibração, não teor volumétrico de água.
inline float converterSoloParaPercentual(int leitura, int seco, int umido) {
  if (leitura < 0 || leitura > 4095 || seco < 0 || seco > 4095 ||
      umido < 0 || umido > 4095 || seco == umido) {
    return NAN;
  }

  float percentual = 100.0f * (leitura - seco) / (umido - seco);
  return fmaxf(0.0f, fminf(100.0f, percentual));
}

// Modelo R = R10 * (10 / lux)^gamma; parâmetros do LDR real ou calibrados.
inline float converterLdrParaLux(float milivolts, float alimentacaoMilivolts,
                                float resistorOhms, float resistencia10LuxOhms,
                                float gamma, LigacaoLdr ligacao) {
  if (!isfinite(milivolts) || !isfinite(alimentacaoMilivolts) ||
      !isfinite(resistorOhms) || !isfinite(resistencia10LuxOhms) ||
      !isfinite(gamma) || milivolts <= 0 || milivolts >= alimentacaoMilivolts ||
      resistorOhms <= 0 || resistencia10LuxOhms <= 0 || gamma <= 0 ||
      (ligacao != LDR_NO_VCC && ligacao != LDR_NO_GND)) {
    return NAN;
  }

  float resistencia = ligacao == LDR_NO_VCC
      ? resistorOhms * (alimentacaoMilivolts - milivolts) / milivolts
      : resistorOhms * milivolts / (alimentacaoMilivolts - milivolts);

  if (!isfinite(resistencia) || resistencia <= 0) return NAN;

  float lux = 10.0f * powf(resistencia10LuxOhms / resistencia, 1.0f / gamma);
  return isfinite(lux) && lux >= 0 ? lux : NAN;
}
