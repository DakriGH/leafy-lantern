using UnityEngine;
using UnityEditor;
using System.Collections.Generic;

[CustomEditor(typeof(BlockDefinition))]
public class BlockDefinitionEditor : Editor
{
    private enum Tab { Construction, Survival, PhysicalShape, InternalLogic, SignalsOUT, SignalsIN }
    private Tab currentTab = Tab.Construction;
    private Vector2 scrollPos;

    // Stili e Texture cache
    private GUIStyle headerStyle;
    private GUIStyle activeEmitterStyle;
    private Texture2D greenTex;
    private Texture2D redTex;
    private Texture2D cyanTex;
    private Texture2D grayTex;

    private void OnEnable()
    {
        // Generiamo le texture una volta sola per evitare memory leaks
        greenTex = MakeTex(1, 1, new Color(0.2f, 1f, 0.4f, 1f));
        redTex = MakeTex(1, 1, new Color(1f, 0.4f, 0.4f, 1f));
        cyanTex = MakeTex(1, 1, new Color(0.2f, 0.9f, 1f, 1f));
        grayTex = MakeTex(1, 1, new Color(0.3f, 0.3f, 0.3f, 1f));
    }

    private void InitStyles()
    {
        if (headerStyle == null) {
            headerStyle = new GUIStyle(EditorStyles.boldLabel);
            headerStyle.fontSize = 13;
            headerStyle.alignment = TextAnchor.MiddleLeft;
            if (EditorGUIUtility.isProSkin) headerStyle.normal.textColor = new Color(0.9f, 0.9f, 0.9f);
        }
        
        if (activeEmitterStyle == null) {
            activeEmitterStyle = new GUIStyle(EditorStyles.helpBox);
        }
    }

    public override void OnInspectorGUI()
    {
        BlockDefinition def = (BlockDefinition)target;
        serializedObject.Update();
        InitStyles();

        // --- HEADER ---
        DrawHeaderSection(def);
        EditorGUILayout.Space(5);

        // --- TAB NAVIGATION ---
        string[] tabNames = new string[] { 
            "🏗️ Build", "❤️ Life", "🧊 Shape", 
            "🧠 Logic", "📡 OUT (Emitters)", "⚡ IN (Reactions)" 
        };

        // Usa SelectionGrid come nel tuo vecchio script
        currentTab = (Tab)GUILayout.SelectionGrid((int)currentTab, tabNames, 3, GUILayout.Height(60));
        
        // Linea divisoria
        GUILayout.Box("", GUILayout.ExpandWidth(true), GUILayout.Height(3)); 
        
        scrollPos = EditorGUILayout.BeginScrollView(scrollPos);
        EditorGUI.BeginChangeCheck();

        switch (currentTab)
        {
            case Tab.Construction: DrawConstructionTab(def); break;
            case Tab.Survival: DrawSurvivalTab(def); break;
            case Tab.PhysicalShape: DrawPhysicalShapeTab(def); break;
            case Tab.InternalLogic: DrawInternalLogicTab(def); break;
            case Tab.SignalsOUT: DrawSignalsOutTab(def); break;
            case Tab.SignalsIN: DrawSignalsInTab(def); break;
        }

        if (EditorGUI.EndChangeCheck())
        {
            EditorUtility.SetDirty(def);
            serializedObject.ApplyModifiedProperties();
        }
        EditorGUILayout.EndScrollView();
    }

    // ================= SEZIONI DI DISEGNO =================

    private void DrawHeaderSection(BlockDefinition def)
    {
        EditorGUILayout.BeginVertical("helpbox");
        EditorGUILayout.BeginHorizontal();
        
        // Icona grande
        Texture2D iconTex = def.identity.icon != null ? def.identity.icon.texture : EditorGUIUtility.FindTexture("GameObject Icon");
        GUILayout.Label(iconTex, GUILayout.Width(64), GUILayout.Height(64));

        EditorGUILayout.BeginVertical();
        EditorGUILayout.LabelField(" BLOCK CONFIGURATION", headerStyle);
        
        EditorGUIUtility.labelWidth = 80;
        def.identity.displayName = EditorGUILayout.TextField("Name", def.identity.displayName);
        
        GUI.color = new Color(1f, 0.8f, 0.8f);
        def.identity.prefabUniqueID = EditorGUILayout.TextField("SAVE ID", def.identity.prefabUniqueID);
        GUI.color = Color.white;
        
        def.identity.icon = (Sprite)EditorGUILayout.ObjectField("Icon", def.identity.icon, typeof(Sprite), false);
        EditorGUILayout.EndVertical();
        
        EditorGUILayout.EndHorizontal();
        EditorGUILayout.EndVertical();
        EditorGUIUtility.labelWidth = 0;
    }

    private void DrawConstructionTab(BlockDefinition def)
    {
        EditorGUILayout.LabelField("Identity & Stacking", EditorStyles.boldLabel);
        EditorGUILayout.BeginVertical("box");
        def.identity.isPlaceable = EditorGUILayout.Toggle("Is Placeable", def.identity.isPlaceable);
        def.identity.allowRotation = EditorGUILayout.Toggle("Can Rotate (R)", def.identity.allowRotation);
        def.identity.stackSize = EditorGUILayout.IntSlider("Stack Size", def.identity.stackSize, 1, 999);
        def.identity.myTag.id = EditorGUILayout.IntField("Category ID", def.identity.myTag.id);
        EditorGUILayout.EndVertical();

        EditorGUILayout.Space(5);
        EditorGUILayout.LabelField("Physics & Placement", EditorStyles.boldLabel);
        EditorGUILayout.BeginVertical("box");
        def.useGravity = EditorGUILayout.Toggle("Use Gravity", def.useGravity);
        def.useCustomColliders = EditorGUILayout.Toggle("Custom Colliders", def.useCustomColliders);
        
        EditorGUILayout.Space(5);
        def.destroyIfSupportRemoved = EditorGUILayout.Toggle("Break if Unsupported", def.destroyIfSupportRemoved);
        def.breakIfBaseIsInvalidAfterFall = EditorGUILayout.Toggle("Break on Bad Landing", def.breakIfBaseIsInvalidAfterFall);
        
        EditorGUILayout.Space(5);
        def.requiresSpecificBase = EditorGUILayout.Toggle("Requires Specific Base", def.requiresSpecificBase);
        if (def.requiresSpecificBase) {
             EditorGUI.indentLevel++;
             EditorGUILayout.HelpBox("List of tags (ID) allowed as base", MessageType.None);
             EditorGUILayout.PropertyField(serializedObject.FindProperty("acceptableBases"), true);
             EditorGUI.indentLevel--;
        }
        
        EditorGUILayout.Space(5);
        EditorGUILayout.LabelField("Navigation AI", EditorStyles.miniBoldLabel);
        if(def.navigation == null) def.navigation = new NavigationSettings();
        def.navigation.type = (GridNavType)EditorGUILayout.EnumPopup("Nav Type", def.navigation.type);
        def.navigation.movementCost = EditorGUILayout.IntSlider("Move Cost", def.navigation.movementCost, 1, 100);

        EditorGUILayout.EndVertical();
    }

    private void DrawSurvivalTab(BlockDefinition def)
    {
        EditorGUILayout.PropertyField(serializedObject.FindProperty("health"), new GUIContent("Health Config"), true);
        EditorGUILayout.Space(10);
        EditorGUILayout.PropertyField(serializedObject.FindProperty("loot"), new GUIContent("Loot Table"), true);
    }

    private void DrawPhysicalShapeTab(BlockDefinition def)
    {
        EditorGUILayout.HelpBox("Grid 5x5 Layout. Center (Pivot) is [2,2].", MessageType.Info);
        
        if (GUILayout.Button("+ Add Collision Layer", GUILayout.Height(24))) { 
            Undo.RecordObject(def, "Add Layer"); 
            def.layers.Add(new Layer { cells = new bool[25] }); 
        }
        
        if (def.layers == null) def.layers = new List<Layer>();

        for (int l = 0; l < def.layers.Count; l++) {
            // FIX ARRAY NULLI
            if (def.layers[l].cells == null || def.layers[l].cells.Length != 25) def.layers[l].cells = new bool[25];

            EditorGUILayout.BeginVertical("box");
            EditorGUILayout.BeginHorizontal();
            EditorGUILayout.LabelField($"Layer Y: {l}", EditorStyles.miniBoldLabel);
            if (GUILayout.Button("Delete", GUILayout.Width(60))) { 
                Undo.RecordObject(def, "Remove Layer"); 
                def.layers.RemoveAt(l); 
                break; 
            }
            EditorGUILayout.EndHorizontal();

            // GRIGLIA 5x5
            for (int z = 4; z >= 0; z--) {
                EditorGUILayout.BeginHorizontal();
                GUILayout.FlexibleSpace();
                for (int x = 0; x < 5; x++) {
                    int idx = z * 5 + x;
                    bool isActive = def.layers[l].cells[idx];
                    bool isPivot = (x==2 && z==2 && l==0);

                    // Usa texture piatte per il look "vecchio stile"
                    Color btnCol = isPivot 
                        ? (isActive ? Color.yellow : new Color(1, 0.4f, 0.4f)) // Pivot
                        : (isActive ? new Color(0.2f, 1f, 0.4f) : Color.grey); // Normale

                    GUI.backgroundColor = btnCol;
                    
                    if (GUILayout.Button(isPivot ? "P" : "", GUILayout.Width(25), GUILayout.Height(25))) {
                        def.layers[l].cells[idx] = !def.layers[l].cells[idx];
                    }
                }
                GUILayout.FlexibleSpace();
                EditorGUILayout.EndHorizontal();
            }
            GUI.backgroundColor = Color.white;
            EditorGUILayout.EndVertical();
        }
    }

    private void DrawInternalLogicTab(BlockDefinition def)
    {
        EditorGUILayout.BeginVertical("box");
        def.hasStates = EditorGUILayout.ToggleLeft(" Enable State Machine", def.hasStates);
        if (def.hasStates) {
            EditorGUILayout.PropertyField(serializedObject.FindProperty("states"), true);
        }
        EditorGUILayout.EndVertical();
        
        EditorGUILayout.Space(5);
        
        EditorGUILayout.BeginVertical("box");
        def.canGrow = EditorGUILayout.ToggleLeft(" Enable Growth System", def.canGrow);
        if (def.canGrow) {
            EditorGUI.indentLevel++;
            def.growthRequirement = EditorGUILayout.FloatField("Required Points", def.growthRequirement);
            def.growthPrefab = (GameObject)EditorGUILayout.ObjectField("Next Stage", def.growthPrefab, typeof(GameObject), false);
            EditorGUI.indentLevel--;
        }
        EditorGUILayout.EndVertical();
    }

    private void DrawSignalsOutTab(BlockDefinition def)
    {
        if (GUILayout.Button("+ Add Emitter", GUILayout.Height(25))) { 
            Undo.RecordObject(def, "Add Emitter"); 
            def.emitters.Add(new OmniEmitterSettings()); 
        }
        
        if (def.emitters.Count == 0) EditorGUILayout.LabelField("(No Emitters defined)", EditorStyles.centeredGreyMiniLabel);

        for (int i = 0; i < def.emitters.Count; i++) {
            var e = def.emitters[i];
            
            // Sfondo verde se attivo, grigio se spento
            GUI.backgroundColor = e.canEmit ? new Color(0.8f, 1f, 0.8f) : Color.white;
            EditorGUILayout.BeginVertical("helpbox");
            GUI.backgroundColor = Color.white;

            EditorGUILayout.BeginHorizontal();
            e.canEmit = EditorGUILayout.Toggle(e.canEmit, GUILayout.Width(20));
            EditorGUILayout.LabelField($"SIGNAL OUT #{i+1}", EditorStyles.boldLabel);
            if (GUILayout.Button("X", GUILayout.Width(25))) { def.emitters.RemoveAt(i); break; }
            EditorGUILayout.EndHorizontal();

            if (e.canEmit) {
                EditorGUIUtility.labelWidth = 110; 
                e.command = EditorGUILayout.TextField("Signal Name", e.command);
                
                EditorGUILayout.BeginHorizontal();
                e.power = EditorGUILayout.FloatField("Strength", e.power);
                e.intValue = EditorGUILayout.IntField("Data (Int)", e.intValue);
                EditorGUILayout.EndHorizontal();
                
                e.interval = EditorGUILayout.FloatField("Interval (sec)", e.interval);
                e.type = (OmniEmitterSettings.EmissionType)EditorGUILayout.EnumPopup("Shape", e.type);
                
                EditorGUI.indentLevel++;
                if (e.type == OmniEmitterSettings.EmissionType.Radius) {
                    e.range = EditorGUILayout.FloatField("Radius", e.range);
                }
                else if (e.type == OmniEmitterSettings.EmissionType.Directional) {
                    e.range = EditorGUILayout.FloatField("Distance", e.range);
                    e.coneAngle = EditorGUILayout.Slider("Angle", e.coneAngle, 1, 180);
                }
                else if (e.type == OmniEmitterSettings.EmissionType.GridSelection) {
                    RenderGridSlices(def, e);
                }
                EditorGUI.indentLevel--;

                EditorGUILayout.Space(2);
                e.activeOnlyInSpecificState = EditorGUILayout.Toggle("State Limit?", e.activeOnlyInSpecificState);
                if (e.activeOnlyInSpecificState) e.requiredState = EditorGUILayout.IntField("State ID", e.requiredState);
                EditorGUIUtility.labelWidth = 0;
            }
            EditorGUILayout.EndVertical();
            EditorGUILayout.Space(5);
        }
    }

    private void RenderGridSlices(BlockDefinition def, OmniEmitterSettings e) {
        if (GUILayout.Button("Add Pattern Slice")) {
            e.slices.Add(new EmitterSlice { width = 5, height = 5, cells = new bool[25] });
        }
        
        for (int s = 0; s < e.slices.Count; s++) {
            var slice = e.slices[s];
            
            // FIX AUTO REPAIR
            int requiredSize = slice.width * slice.height;
            if (slice.cells == null || slice.cells.Length != requiredSize) {
                slice.cells = new bool[requiredSize];
            }

            EditorGUILayout.BeginVertical("box");
            EditorGUILayout.BeginHorizontal();
            
            EditorGUILayout.LabelField($"Y Offset:", GUILayout.Width(60));
            if (GUILayout.Button("-", GUILayout.Width(20))) slice.yOffset--;
            EditorGUILayout.LabelField($"{slice.yOffset}", EditorStyles.boldLabel, GUILayout.Width(20));
            if (GUILayout.Button("+", GUILayout.Width(20))) slice.yOffset++;
            
            GUILayout.FlexibleSpace();
            if (GUILayout.Button("X", GUILayout.Width(20))) { e.slices.RemoveAt(s); break; }
            EditorGUILayout.EndHorizontal();

            // Griglia slice
            int w = slice.width; int h = slice.height;
            for (int z = h - 1; z >= 0; z--) {
                EditorGUILayout.BeginHorizontal();
                GUILayout.FlexibleSpace();
                for (int x = 0; x < w; x++) {
                    int idx = z * w + x;
                    bool center = (x == w/2 && z == h/2);
                    
                    // Colori per la slice (Ciano normale, Magenta centro)
                    GUI.backgroundColor = slice.cells[idx] 
                        ? (center ? Color.magenta : Color.cyan) 
                        : (center ? new Color(0.8f, 0, 0) : Color.black);
                    
                    if (GUILayout.Button("", GUILayout.Width(20), GUILayout.Height(20))) {
                        slice.cells[idx] = !slice.cells[idx];
                    }
                }
                GUILayout.FlexibleSpace();
                EditorGUILayout.EndHorizontal();
            }
            GUI.backgroundColor = Color.white;
            EditorGUILayout.EndVertical();
        }
    }

    private void DrawSignalsInTab(BlockDefinition def)
    {
        if (GUILayout.Button("+ Add Input Reaction", GUILayout.Height(25))) { 
            Undo.RecordObject(def, "Add Reaction"); 
            def.omniReactions.Add(new OmniReaction()); 
        }
        
        if (def.omniReactions.Count == 0) EditorGUILayout.LabelField("(No Reactions defined)", EditorStyles.centeredGreyMiniLabel);

        for (int i = 0; i < def.omniReactions.Count; i++)
        {
            OmniReaction r = def.omniReactions[i];
            
            // Colora header in base al tipo di reazione per leggibilità
            Color headerCol = Color.white;
            switch(r.action) {
                case OmniReaction.ReactionType.Damage: headerCol = new Color(1f, 0.8f, 0.8f); break;
                case OmniReaction.ReactionType.Heal: headerCol = new Color(0.8f, 1f, 0.8f); break;
                case OmniReaction.ReactionType.ChangeState: headerCol = new Color(0.8f, 0.9f, 1f); break;
            }

            GUI.backgroundColor = headerCol;
            EditorGUILayout.BeginVertical("helpbox");
            GUI.backgroundColor = Color.white;

            EditorGUILayout.BeginHorizontal();
            EditorGUILayout.LabelField($"IF SIGNAL '{r.command}'", EditorStyles.boldLabel);
            if (GUILayout.Button("X", GUILayout.Width(25))) { def.omniReactions.RemoveAt(i); break; }
            EditorGUILayout.EndHorizontal();

            EditorGUIUtility.labelWidth = 110;
            r.command = EditorGUILayout.TextField("Command", r.command);
            
            EditorGUILayout.BeginHorizontal();
            r.successChance = EditorGUILayout.FloatField("Chance %", r.successChance);
            r.cooldown = EditorGUILayout.FloatField("Cooldown", r.cooldown);
            EditorGUILayout.EndHorizontal();

            r.onlyInSpecificState = EditorGUILayout.Toggle("Requires State?", r.onlyInSpecificState);
            if(r.onlyInSpecificState) r.requiredState = EditorGUILayout.IntField("State ID", r.requiredState);

            EditorGUILayout.Space(5);
            EditorGUILayout.LabelField("THEN ACTION:", EditorStyles.miniBoldLabel);
            
            r.action = (OmniReaction.ReactionType)EditorGUILayout.EnumPopup("Effect", r.action);

            if (r.action != OmniReaction.ReactionType.InteractionClick) {
                r.useInternalValues = EditorGUILayout.Toggle("Fixed Value?", r.useInternalValues);
                if (r.useInternalValues) r.value = EditorGUILayout.FloatField("Value/ID", r.value);
            }

            // Damage/Loot Source Configuration
            if (r.action == OmniReaction.ReactionType.Damage || r.action == OmniReaction.ReactionType.Destroy) {
                EditorGUILayout.BeginVertical("box");
                EditorGUILayout.LabelField("💥 Damage & Loot Config", EditorStyles.miniBoldLabel);
                
                EditorGUILayout.BeginHorizontal();
                EditorGUIUtility.labelWidth = 60;
                r.toolID = EditorGUILayout.IntField("Tool ID", r.toolID);
                r.toolSubID = EditorGUILayout.IntField("Sub ID", r.toolSubID);
                EditorGUILayout.EndHorizontal();

                // --- SELEZIONE DEL TARGET PER IL LOOT ---
                EditorGUIUtility.labelWidth = 100;
                r.lootDest = (LootTarget)EditorGUILayout.EnumPopup("Loot Target", r.lootDest);
                
                EditorGUILayout.EndVertical();
            }

            EditorGUIUtility.labelWidth = 0;
            EditorGUILayout.EndVertical();
            EditorGUILayout.Space(5);
        }
    }

    // Helper per texture a tinta unita (cache-friendly)
    private Texture2D MakeTex(int width, int height, Color col) {
        Color[] pix = new Color[width * height];
        for (int i = 0; i < pix.Length; ++i) pix[i] = col;
        Texture2D result = new Texture2D(width, height);
        result.SetPixels(pix); result.Apply(); return result;
    }
}