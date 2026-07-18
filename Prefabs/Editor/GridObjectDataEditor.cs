using UnityEngine;
using UnityEditor;

[CustomEditor(typeof(GridObjectData))]
public class GridObjectDataEditor : Editor
{
    public override void OnInspectorGUI()
    {
        GridObjectData data = (GridObjectData)target;

        // --- 1. HEADER & DEFINITION LINK ---
        GUI.backgroundColor = new Color(0.2f, 0.2f, 0.2f);
        EditorGUILayout.BeginVertical(EditorStyles.helpBox);
        GUI.backgroundColor = Color.white;

        EditorGUILayout.LabelField("📦 BLOCK COMPONENT", EditorStyles.boldLabel);
        
        EditorGUI.BeginChangeCheck();
        SerializedProperty defProp = serializedObject.FindProperty("definition");
        EditorGUILayout.PropertyField(defProp);
        if (EditorGUI.EndChangeCheck()) serializedObject.ApplyModifiedProperties();

        if (data.definition == null)
        {
            EditorGUILayout.HelpBox("CRITICAL: Assign a Block Definition!", MessageType.Error);
        }
        else
        {
            if (GUILayout.Button("Edit Block Definition (Data)", GUILayout.Height(30)))
            {
                Selection.activeObject = data.definition;
            }
        }
        EditorGUILayout.EndVertical();

        EditorGUILayout.Space(10);

        // --- 2. RUNTIME DEBUG (Solo se in Play Mode) ---
        if (Application.isPlaying)
        {
            EditorGUILayout.LabelField("▶ RUNTIME DEBUG", EditorStyles.boldLabel);
            
            // Health Bar
            float hp = data.GetCurrentHealth();
            float maxHp = data.definition != null ? data.definition.health.maxHealth : 100f;
            DrawProgressBar(hp / maxHp, $"Health: {hp}/{maxHp}");

            // State Info
            EditorGUILayout.BeginVertical(EditorStyles.helpBox);
            EditorGUILayout.LabelField($"Current State Index: {data.currentStateIndex}");
            if (data.canGrow)
            {
                DrawProgressBar(data.currentGrowth / data.growthRequirement, $"Growth: {data.currentGrowth:F1}/{data.growthRequirement}");
            }
            EditorGUILayout.EndVertical();

            // Repaint per vedere l'animazione dei valori
            Repaint();
        }
        else
        {
            // Se non in play, mostra le impostazioni "Override" se ne hai (tipo currentStateIndex iniziale)
            EditorGUILayout.LabelField("Initial Settings", EditorStyles.boldLabel);
            DrawPropertiesExcluding(serializedObject, "m_Script", "definition");
            serializedObject.ApplyModifiedProperties();
        }
    }

    void DrawProgressBar(float value, string label)
    {
        Rect rect = GUILayoutUtility.GetRect(18, 18, "TextField");
        EditorGUI.ProgressBar(rect, value, label);
    }
}