// An excerpt of Satisfactory 1.1's CommunityResources/Docs/en-US.json for the importer's tests:
// the real structure and values, cut down to a few classes and the keys the importer reads.
export const docsExcerpt: { NativeClass: string; Classes: ({ ClassName: string } & Record<string, unknown>)[] }[] = [
  {
    NativeClass: "/Script/CoreUObject.Class'/Script/FactoryGame.FGItemDescriptor'",
    Classes: [
      {
        ClassName: "Desc_IronIngot_C",
        mDisplayName: "Iron Ingot",
        mForm: "RF_SOLID",
        mSmallIcon:
          "Texture2D /Game/FactoryGame/Resource/Parts/IronIngot/UI/IconDesc_IronIngot_256.IconDesc_IronIngot_256",
        mEnergyValue: "0.000000",
      },
      {
        ClassName: "Desc_NuclearWaste_C",
        mDisplayName: "Uranium Waste",
        mForm: "RF_SOLID",
        mSmallIcon:
          "Texture2D /Game/FactoryGame/Resource/Parts/NuclearWaste/UI/IconDesc_NuclearWaste_256.IconDesc_NuclearWaste_256",
        mEnergyValue: "0.000000",
      },
    ],
  },
  {
    NativeClass: "/Script/CoreUObject.Class'/Script/FactoryGame.FGResourceDescriptor'",
    Classes: [
      {
        ClassName: "Desc_OreIron_C",
        mDisplayName: "Iron Ore",
        mForm: "RF_SOLID",
        mSmallIcon:
          "Texture2D /Game/FactoryGame/Resource/RawResources/Nodes/UI/IconDesc_iron_new_256.IconDesc_iron_new_256",
        mEnergyValue: "0.000000",
      },
      {
        ClassName: "Desc_Coal_C",
        mDisplayName: "Coal",
        mForm: "RF_SOLID",
        mSmallIcon:
          "Texture2D /Game/FactoryGame/Resource/RawResources/Coal/UI/IconDesc_CoalOre_256.IconDesc_CoalOre_256",
        mEnergyValue: "300.000000",
      },
      {
        ClassName: "Desc_NitrogenGas_C",
        mDisplayName: "Nitrogen Gas",
        mForm: "RF_GAS",
        mSmallIcon:
          "Texture2D /Game/FactoryGame/Resource/Parts/PackagedNitrogen/UI/IconDesc_NitrogenGas_256.IconDesc_NitrogenGas_256",
        mEnergyValue: "0.000000",
      },
      {
        ClassName: "Desc_Water_C",
        mDisplayName: "Water",
        mForm: "RF_LIQUID",
        mSmallIcon:
          "Texture2D /Game/FactoryGame/Resource/RawResources/Water/UI/LiquidWater_Pipe_256.LiquidWater_Pipe_256",
        mEnergyValue: "0.000000",
      },
    ],
  },
  {
    NativeClass: "/Script/CoreUObject.Class'/Script/FactoryGame.FGRecipe'",
    Classes: [
      {
        ClassName: "Recipe_IngotIron_C",
        mDisplayName: "Iron Ingot",
        mIngredients:
          "((ItemClass=\"/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/Resource/RawResources/OreIron/Desc_OreIron.Desc_OreIron_C'\",Amount=1))",
        mProduct:
          "((ItemClass=\"/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/Resource/Parts/IronIngot/Desc_IronIngot.Desc_IronIngot_C'\",Amount=1))",
        mManufactoringDuration: "2.000000",
        mProducedIn:
          '("/Game/FactoryGame/Buildable/Factory/SmelterMk1/Build_SmelterMk1.Build_SmelterMk1_C","/Game/FactoryGame/Buildable/-Shared/WorkBench/BP_WorkBenchComponent.BP_WorkBenchComponent_C","/Script/FactoryGame.FGBuildableAutomatedWorkBench")',
      },
      {
        ClassName: "Recipe_SmelterMk1_C",
        mDisplayName: "Foundry",
        mIngredients:
          "((ItemClass=\"/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/Resource/Parts/ModularFrame/Desc_ModularFrame.Desc_ModularFrame_C'\",Amount=10),(ItemClass=\"/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/Resource/Parts/Rotor/Desc_Rotor.Desc_Rotor_C'\",Amount=10),(ItemClass=\"/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/Resource/Parts/Cement/Desc_Cement.Desc_Cement_C'\",Amount=20))",
        mProduct:
          "((ItemClass=\"/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/Buildable/Factory/FoundryMk1/Desc_FoundryMk1.Desc_FoundryMk1_C'\",Amount=1))",
        mManufactoringDuration: "1.000000",
        mProducedIn: '("/Game/FactoryGame/Equipment/BuildGun/BP_BuildGun.BP_BuildGun_C")',
      },
      {
        ClassName: "Recipe_Alternate_PureIronIngot_C",
        mDisplayName: "Alternate: Pure Iron Ingot",
        mIngredients:
          "((ItemClass=\"/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/Resource/RawResources/OreIron/Desc_OreIron.Desc_OreIron_C'\",Amount=7),(ItemClass=\"/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/Resource/RawResources/Water/Desc_Water.Desc_Water_C'\",Amount=4000))",
        mProduct:
          "((ItemClass=\"/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/Resource/Parts/IronIngot/Desc_IronIngot.Desc_IronIngot_C'\",Amount=13))",
        mManufactoringDuration: "12.000000",
        mProducedIn: '("/Game/FactoryGame/Buildable/Factory/OilRefinery/Build_OilRefinery.Build_OilRefinery_C")',
      },
    ],
  },
  {
    NativeClass: "/Script/CoreUObject.Class'/Script/FactoryGame.FGBuildableConveyorBelt'",
    Classes: [
      {
        ClassName: "Build_ConveyorBeltMk1_C",
        mDisplayName: "Conveyor Belt Mk.1",
        mSpeed: "120.000000",
      },
      {
        ClassName: "Build_ConveyorBeltMk6_C",
        mDisplayName: "Conveyor Belt Mk.6",
        mSpeed: "2400.000000",
      },
    ],
  },
  {
    NativeClass: "/Script/CoreUObject.Class'/Script/FactoryGame.FGBuildableGeneratorFuel'",
    Classes: [
      {
        ClassName: "Build_GeneratorCoal_C",
        mDisplayName: "Coal-Powered Generator",
        mPowerProduction: "75.000000",
        mFuel: [
          {
            mFuelClass: "Desc_Coal_C",
            mSupplementalResourceClass: "Desc_Water_C",
            mByproduct: "",
            mByproductAmount: "",
          },
        ],
        mSupplementalToPowerRatio: "10.000000",
      },
    ],
  },
  {
    NativeClass: "/Script/CoreUObject.Class'/Script/FactoryGame.FGBuildablePipeline'",
    Classes: [
      {
        ClassName: "Build_Pipeline_C",
        mDisplayName: "Pipeline Mk.1",
        mFlowLimit: "5.000000",
      },
      {
        ClassName: "Build_PipelineMK2_C",
        mDisplayName: "Pipeline Mk.2",
        mFlowLimit: "10.000000",
      },
      {
        ClassName: "Build_Pipeline_NoIndicator_C",
        mDisplayName: "Clean Pipeline Mk.1",
        mFlowLimit: "5.000000",
      },
    ],
  },
  {
    NativeClass: "/Script/CoreUObject.Class'/Script/FactoryGame.FGBuildableWaterPump'",
    Classes: [
      {
        ClassName: "Build_WaterPump_C",
        mDisplayName: "Water Extractor",
        mPowerConsumption: "20.000000",
        mAllowedResourceForms: "(RF_LIQUID)",
        mAllowedResources:
          "(\"/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/Resource/RawResources/Water/Desc_Water.Desc_Water_C'\")",
        mOnlyAllowCertainResources: "True",
      },
    ],
  },
  {
    NativeClass: "/Script/CoreUObject.Class'/Script/FactoryGame.FGBuildableManufacturerVariablePower'",
    Classes: [
      {
        ClassName: "Build_HadronCollider_C",
        mDisplayName: "Particle Accelerator",
        mManufacturingSpeed: "1.000000",
        mPowerConsumption: "0.100000",
        mEstimatedMininumPowerConsumption: "250.000000",
        mEstimatedMaximumPowerConsumption: "1500.000000",
      },
    ],
  },
  {
    NativeClass: "/Script/CoreUObject.Class'/Script/FactoryGame.FGBuildableResourceExtractor'",
    Classes: [
      {
        ClassName: "Build_MinerMk1_C",
        mDisplayName: "Miner Mk.1",
        mPowerConsumption: "5.000000",
        mAllowedResourceForms: "(RF_SOLID)",
        mAllowedResources: "",
        mOnlyAllowCertainResources: "False",
      },
    ],
  },
  {
    NativeClass: "/Script/CoreUObject.Class'/Script/FactoryGame.FGBuildableManufacturer'",
    Classes: [
      {
        ClassName: "Build_OilRefinery_C",
        mDisplayName: "Refinery",
        mManufacturingSpeed: "1.000000",
        mPowerConsumption: "30.000000",
      },
      {
        ClassName: "Build_SmelterMk1_C",
        mDisplayName: "Smelter",
        mManufacturingSpeed: "1.000000",
        mPowerConsumption: "4.000000",
      },
    ],
  },
  {
    NativeClass: "/Script/CoreUObject.Class'/Script/FactoryGame.FGItemDescriptorNuclearFuel'",
    Classes: [
      {
        ClassName: "Desc_NuclearFuelRod_C",
        mDisplayName: "Uranium Fuel Rod",
        mForm: "RF_SOLID",
        mSmallIcon:
          "Texture2D /Game/FactoryGame/Resource/Parts/NuclearFuelRod/UI/IconDesc_NuclearFuelRod_256.IconDesc_NuclearFuelRod_256",
        mEnergyValue: "750000.000000",
      },
    ],
  },
  {
    NativeClass: "/Script/CoreUObject.Class'/Script/FactoryGame.FGBuildableGeneratorNuclear'",
    Classes: [
      {
        ClassName: "Build_GeneratorNuclear_C",
        mDisplayName: "Nuclear Power Plant",
        mPowerProduction: "2500.000000",
        mFuel: [
          {
            mFuelClass: "Desc_NuclearFuelRod_C",
            mSupplementalResourceClass: "Desc_Water_C",
            mByproduct: "Desc_NuclearWaste_C",
            mByproductAmount: "50",
          },
        ],
        mSupplementalToPowerRatio: "1.600000",
      },
    ],
  },
  {
    NativeClass: "/Script/CoreUObject.Class'/Script/FactoryGame.FGBuildableFrackingExtractor'",
    Classes: [
      {
        ClassName: "Build_FrackingExtractor_C",
        mDisplayName: "Resource Well Extractor",
        mPowerConsumption: "0.000000",
        mAllowedResourceForms: "(RF_LIQUID,RF_GAS)",
        mAllowedResources:
          "(\"/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/Resource/RawResources/CrudeOil/Desc_LiquidOil.Desc_LiquidOil_C'\",\"/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/Resource/RawResources/NitrogenGas/Desc_NitrogenGas.Desc_NitrogenGas_C'\",\"/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/Resource/RawResources/Water/Desc_Water.Desc_Water_C'\")",
        mOnlyAllowCertainResources: "True",
      },
    ],
  },
  {
    NativeClass: "/Script/CoreUObject.Class'/Script/FactoryGame.FGConsumableDescriptor'",
    Classes: [
      {
        ClassName: "Desc_Berry_C",
        mDisplayName: "Paleberry",
        mForm: "RF_SOLID",
        mSmallIcon: "Texture2D /Game/FactoryGame/Resource/Environment/Berry/UI/IconDesc_Berry_256.IconDesc_Berry_256",
        mEnergyValue: "0.000000",
      },
    ],
  },
];
