Shader "Custom/GridDamageShell_Unity6"
{
    Properties
    {
        [NoScaleOffset] _MainTex ("Crack Texture (Black on White)", 2D) = "white" {}
        _Damage ("Current Damage", Range(0, 1)) = 0
        _CrackColor ("Crack Color", Color) = (0,0,0,1)
        _Tile ("Texture Tiling", Float) = 2.0
        _Sharpness ("Crack Boldness", Range(1, 20)) = 10.0
        _MinAlpha ("Initial Transparency", Range(0, 1)) = 0.2
        _MaxIntensityLimit ("Max Growth Limit", Range(0, 1)) = 0.7 
    }

    SubShader
    {
        Tags 
        { 
            "RenderPipeline" = "UniversalPipeline"
            "RenderType" = "Transparent" 
            "Queue" = "Transparent+100" 
        }

        Pass
        {
            Name "DamagePass"
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            Cull Back
            Offset -1, -1 

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS   : NORMAL;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionOS : TEXCOORD0;
                float3 normalOS   : TEXCOORD1;
            };

            TEXTURE2D(_MainTex);
            SAMPLER(sampler_MainTex);

            CBUFFER_START(UnityPerMaterial)
                float _Damage;
                float4 _CrackColor;
                float _Tile;
                float _Sharpness;
                float _MinAlpha;
                float _MaxIntensityLimit;
                float4x4 _RotationMatrix; // Matrice per ruotare la texture
            CBUFFER_END

            Varyings vert(Attributes input)
            {
                Varyings output;
                float3 pos = input.positionOS.xyz + (input.normalOS * 0.001);
                output.positionCS = TransformObjectToHClip(pos);
                output.positionOS = input.positionOS.xyz;
                output.normalOS   = input.normalOS;
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                // Ruotiamo la posizione locale usando la matrice casuale passata dallo script
                float3 rotatedPos = mul((float3x3)_RotationMatrix, input.positionOS);
                float3 rotatedNormal = mul((float3x3)_RotationMatrix, input.normalOS);

                float3 blending = abs(rotatedNormal);
                blending /= (blending.x + blending.y + blending.z);

                // Campionamento triplanare sulle coordinate ruotate
                float4 colX = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, rotatedPos.yz * _Tile);
                float4 colY = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, rotatedPos.xz * _Tile);
                float4 colZ = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, rotatedPos.xy * _Tile);
                float4 crackTex = colX * blending.x + colY * blending.y + colZ * blending.z;

                float effectiveDamage = min(_Damage, _MaxIntensityLimit);
                float mask = saturate((effectiveDamage - crackTex.r) * _Sharpness);
                
                float currentAlpha = lerp(_MinAlpha, 1.0, _Damage);
                float finalAlpha = smoothstep(0, 0.5, mask) * currentAlpha;

                return half4(_CrackColor.rgb, finalAlpha);
            }
            ENDHLSL
        }
    }
}